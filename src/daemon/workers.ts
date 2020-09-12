import path from "path";
import cluster from "cluster";
import mkdirp from "mkdirp";
import { Worker } from "./worker";
import { WorkerStartResult } from "../lib/types";
import { log, handle, sendLogs } from "../lib/log";
import lm from "../lib/logs";

const NOEND = {
    end: false,
};

export class WorkerManager {
    /**
     * Starts the workers for a specific app.
     * @param {*} config - The config file with a .save option.
     * @param {string} dir - The direcotry of the app.
     * @param {*} pack - The package object of the app.
     * @param {number} workerCount - The count of workers you want to start. Note: This may differ from the pack.workers
     * @param {string[]} args - Arguments for the worker processes.
     * @param {*} env - Environment variables for the worker processes.
     * @param {*} connection - A connection to the CLI.
     * @returns {Promise.<{app: string, dir: string, started: number, ports: number[]}>}
     */
    async startWorkers(
        config,
        dir: string,
        pack,
        workerCount: number,
        args = [],
        env = {},
        connection,
    ): Promise<WorkerStartResult> {
        const workers = [];

        if (pack.name === "appz") {
            throw new Error('the name "appz" is invalid');
        }

        const ports = pack.ports;
        const streams = lm.get(pack.name);

        // output path
        let output = null;
        if (typeof pack.output === "string") {
            if (path.isAbsolute(pack.output)) {
                output = pack.output;
            } else {
                output = path.join(dir, pack.output);
            }
        } else {
            output = path.join(process.env.HOME, ".appz", pack.name);
        }

        const app = config.apps.find((app) => app.name === pack.name);
        app.workers = pack.workers;
        config.save();

        const exitPromises = [];
        const availablePromises = [];

        // setup logs
        await mkdirp(output);

        lm.setup(pack.name, output);

        const logs = sendLogs(pack.name, connection);

        // setup master
        cluster.setupMaster({
            stdio: ["ignore", "pipe", "pipe", "ipc"],
            args,
        });

        const ENV = Object.assign({}, env, {
            PWD: dir,
            APPNAME: pack.name,
            PORT: ports[0],
            PORTS: ports.join(),
            WORKERS: pack.workers,
        });

        for (let i = 0; i < workerCount; i += 1) {
            const worker = new Worker(dir, pack.main, pack.name, ports, ENV);
            const w = worker.w;
            w.process.stdout.pipe(streams.log, NOEND);
            w.process.stderr.pipe(streams.err, NOEND);
            w.on("error", handle);

            workers.push(worker);

            exitPromises.push(
                worker.once("exit").then((code) => {
                    throw new Error(
                        `worker of app "${pack.name}" not started (exit code: ${code})`,
                    );
                }),
            );
            availablePromises.push(worker.once("available"));

            worker
                .once("available")
                .then(async () => {
                    // wait to resurrect the worker
                    const code = await worker.once("exit");
                    if (code) {
                        log(
                            `worker ${worker.id} of "${worker.name}" crashed. (code: ${code})`,
                        );
                    }

                    if (worker.state !== Worker.KILLED) {
                        // revive worker
                        log(`starting 1 new worker for "${worker.name}"`);

                        const app = config.apps.find(
                            (app) => app.name === worker.name,
                        );

                        log("found app", app.name);

                        if (!app) {
                            return;
                        }

                        if (!app.reviveCount) {
                            app.reviveCount = 0;
                        }

                        app.reviveCount += 1;

                        // passing the connection (even if it's dead) is necessary because some modules depend on it.
                        await this.startWorkers(
                            config,
                            dir,
                            pack,
                            1,
                            args,
                            env,
                            connection,
                        );
                    }
                })
                .catch(handle);
        }

        const availablePromise = Promise.all(availablePromises);
        const exitPromise = Promise.race(exitPromises);

        try {
            // Wait for all workers to start.
            await Promise.race([
                exitPromise,
                availablePromise,
                connection.SIGINT,
            ]);

            logs.stop();

            return {
                app: pack.name,
                dir,
                started: workerCount,
                ports,
            };
        } catch (err) {
            // must be called before killWorkers to prevent duplication
            logs.stop();

            await this.killWorkers(workers, 0, "SIGTERM", connection);
            lm.remove(pack.name);

            throw err;
        }
    }

    /**
     * Kills all workers. Returns the number of killed workers.
     * @param {*} workers
     * @param {number} timeout
     * @param {string} signal
     * @param {*} connection
     * @returns {number}
     */
    async killWorkers(
        workers,
        timeout: number,
        signal: string,
        connection,
    ): Promise<number> {
        workers.forEach((worker) => {
            log(
                `kill worker ${
                    worker.id
                }, connected: ${worker.w.isConnected()}, dead: ${worker.w.isDead()}`,
            );
        });
        const killed = workers.map(async (worker) => {
            if (worker.isConnected()) {
                const logs = sendLogs(worker, connection);
                const exit = worker.once("exit");

                if (worker.kill(signal, timeout)) {
                    await exit;
                }

                logs.stop();

                return true;
            }
            return false;
        });

        const result = await Promise.all(killed);

        return result.filter((w) => w).length;
    }
}

export default new WorkerManager();
