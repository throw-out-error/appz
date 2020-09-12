import { rm } from "./remote-server";
import { promisify } from "@throw-out-error/throw-out-utils";
import xTime from "x-time";
import { handle } from "../lib/log";
import AppStats from "../lib/app-stats";
import { Worker } from "./worker";
const states = Worker.states;
import util, { mergePorts } from "../lib/util";
import { WorkerConfig, ListAppStats, App } from "../lib/types";
import wm from "./workers";
import { getPack } from "../lib/imports";
import { sendLogs } from "../lib/log";
import { RemoteEventEmitter } from "@throw-out-error/better-events";
import lm from "../lib/logs";

function info(config, command) {
    return new Promise((resolve) => {
        const app = config.apps.find((app) => app.name === command.app);

        if (!app) {
            throw new Error(`app "${command.app}" not found`);
        }

        const stats = new AppStats(app.dir);

        // add general information
        stats.name = app.name;
        stats.reviveCount = app.reviveCount || 0;

        const workers = Worker.workerList.filter(
            (worker) => worker.name === command.app,
        );

        workers.forEach((worker) => {
            // add worker states
            const state = states[worker.state].toLowerCase();
            stats[state]++;
            // add ports
            stats.ports = mergePorts(stats.ports, worker.ports);
        });

        resolve(stats);
    });
}

function exit(): Promise<unknown> {
    async function closeAndExit(timeout = 10000) {
        const close = promisify(rm.close, rm);
        const closePromise = close();
        const timeoutPromise = xTime(timeout);

        await Promise.race([closePromise, timeoutPromise]);

        process.exit();
    }

    closeAndExit().catch(handle);

    return Promise.resolve({});
}

function list(
    config: WorkerConfig,
): Promise<{
    isResurrectable: boolean;
    stats: ListAppStats;
}> {
    return new Promise((resolve) => {
        const stats = {};

        /**
         * @typedef AppStats
         * @property {string} dir
         * @property {number} pending
         * @property {number} available
         * @property {number} killed
         * @property {number[]} ports
         * @property {number} workers - The number of workers that should be available.
         */

        /**
         * @typedef app
         * @property {string} dir
         * @property {string} name
         * @property {number} [reviveCount]
         * @property {number} [workers]
         */

        /**
         * Add an app to the stats.
         * @param {app} app
         */
        function addApp(app: App) {
            stats[app.name] = {
                dir: app.dir,
                pending: 0,
                available: 0,
                killed: 0,
                ports: [],
                reviveCount: app.reviveCount || 0,
                workers: app.workers || 0,
            };
        }

        // show every started app (even if no workers are running)
        config.apps.forEach(addApp);

        Worker.workerList.forEach((worker) => {
            const { name } = worker;

            // show stopped apps that have running workers
            if (!stats[name]) {
                addApp({
                    name,
                    dir: worker.dir,
                });
            }

            /** @type {AppStats} */
            const appStats = stats[name];

            // increase state counter
            const state = Worker.states[worker.state].toLowerCase();
            appStats[state]++;

            // add ports
            appStats.ports = mergePorts(appStats.ports, worker.ports);
        });

        resolve({
            isResurrectable: util.isResurrectable,
            stats,
        });
    });
}

function ping() {
    return Promise.resolve({});
}

async function restart(config, command, connection) {
    // find old app
    const app = config.apps.find((app) => app.name === command.app);

    if (!app) {
        throw new Error(`app "${command.app}" not found`);
    }

    // reload package.json
    const pack = await getPack(app.dir, app.opt, app.env);

    // if name changed
    const nameChanged = pack.name !== app.name;
    if (nameChanged) {
        // check name
        if (config.apps.some((app) => app.name === pack.name)) {
            throw new Error(`new name "${pack.name}" already in use`);
        }

        // save new app
        config.apps.push(
            Object.assign({}, app, {
                name: pack.name,
            }),
        );

        config.save();
    }

    // set default timeout
    const timeout = command.opt.timeout;

    // remember old workers
    const workers = Worker.workerList.filter(
        (worker) => worker.name === command.app,
    );

    const data = await wm.startWorkers(
        config,
        app.dir,
        pack,
        pack.workers,
        app.args,
        app.env,
        connection,
    );

    // kill old workers
    const workersKilled = await wm.killWorkers(
        workers,
        timeout,
        command.opt.signal,
        connection,
    );

    if (nameChanged) {
        // remove old version
        const oldIndex = config.apps.findIndex(
            (app) => app.name === command.app,
        );
        config.apps.splice(oldIndex, 1);
        config.save();
    }

    data.killed = workersKilled;

    return data;
}

function restartAll(config, command, connection) {
    const q = [];

    config.apps.forEach((app) => {
        const cmd = Object.assign({}, command, {
            app: app.name,
        });

        q.push(restart(config, cmd, connection));
    });

    return Promise.all(q).then((stats) => {
        return stats.reduce(
            (a, b) => {
                a.started += b.started;
                a.killed += b.killed;
                return a;
            },
            {
                app: "*",
                started: 0,
                killed: 0,
            },
        );
    });
}

async function logs(config, command, connection) {
    const logs = sendLogs(command.app, connection);

    return new Promise((resolve) => {
        connection.on("SIGINT", () => {
            logs.stop();
            resolve({});
        });
    });
}

function resurrect(
    config: WorkerConfig,
    command: unknown,
    connection: RemoteEventEmitter,
): Promise<{
    app: App | string;
    started: number;
}> {
    return new Promise((resolve, reject) => {
        if (!util.isResurrectable) {
            throw new Error("already resurrected");
        }

        util.isResurrectable = false;

        const q = config.apps.map(async (app: App) => {
            const pack = (await getPack(app.dir, app.opt, app.env)) as any;

            return wm.startWorkers(
                config,
                app.dir,
                pack,
                pack.workers,
                app.args,
                app.env,
                connection,
            );
        });

        Promise.all(q)
            .then(() => {
                resolve({
                    app: "*",
                    started: Worker.workerList.length,
                });
            })
            .catch(reject);
    });
}

/*
 * Start the app specified in the command object.
 * @param {config} config - The appz-config-object.
 * @param {startCommandObject} command - An object containing the details of the command.
 */
async function start(config: WorkerConfig, command, connection) {
    if (util.isResurrectable) {
        util.isResurrectable = false;
        config.apps = [];
    }

    // (re)load package
    const pack = await getPack(command.dir, command.opt, command.env);

    // check for duplicate name
    if (config.apps.some((app) => app.name === pack.name)) {
        throw new Error(`an app called "${pack.name}" is already running.`);
    }

    config.apps.push({
        dir: command.dir,
        name: pack.name,
        args: command.args,
        opt: command.opt,
        env: command.env,
    });
    config.save();

    try {
        return await wm.startWorkers(
            config,
            command.dir,
            pack,
            pack.workers,
            command.args,
            command.env,
            connection,
        );
    } catch (err) {
        // remove app from config

        const i = config.apps.findIndex((app) => app.name === pack.name);
        if (i !== -1) {
            config.apps.splice(i, 1);
            config.save();
        }

        throw err;
    }
}

async function stop(
    config: {
        apps: App[];
        save: () => void;
    },
    command,
    connection,
): Promise<{
    app: unknown;
    killed: number;
}> {
    const timeout = command.opt.timeout;

    const workers = Worker.workerList.filter(
        (worker) => worker.name === command.app,
    );

    const workersKilled = await wm.killWorkers(
        workers,
        timeout,
        command.opt.signal,
        connection,
    );

    const i = config.apps.findIndex((app) => app.name === command.app);

    if (i !== -1) {
        // don't send output to cli anymore

        lm.remove(config.apps[i].name);
        // remove the app from the config
        config.apps.splice(i, 1);
    }

    config.save();

    return {
        app: command.app,
        killed: workersKilled,
    };
}

export default {
    exit,
    info,
    list,
    logs,
    ping,
    restartAll,
    restart,
    resurrect,
    start,
    stop,
};
