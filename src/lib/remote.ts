import xTime from "x-time";
import net from "net";
import cp from "child_process";
import path from "path";
import { promisify } from "@throw-out-error/throw-out-utils";
import { EventEmitter } from "events";
import { once, RemoteEventEmitter } from "@throw-out-error/better-events";
import { parseTimeout } from "./util";
import {
    AppOptions,
    InfoResult,
    KillOptions,
    ListResult,
    RestartAllResult,
    ResurrectResult,
    StartResult,
    StopResult,
} from "./types";
import { handle } from "./log";

/**
 * A class representing a set of commands to control appz.
 * @class
 */
export default class Remote extends EventEmitter {
    socketFile: string;
    /**
     * Create a new Remote instance.
     * @param {string} socketFile - Path to the socket file of the appz daemon.
     */
    constructor(socketFile: string) {
        super();
        /** @type {string} */
        this.socketFile = socketFile;
    }

    /**
     * Sends the "ready" signal to the appz daemon.
     * @returns {Promise.<void>}
     */
    async ready(): Promise<void> {
        if (typeof process.send !== "function") {
            throw new Error(
                'Can not send the "ready" signal to appz because process.send() is not defined.',
            );
        }

        const send = promisify(process.send, process);
        await send("ready");
    }

    /**
     * @typedef resurrectResult
     * @property {number} started - Number of started workers.
     */

    /**
     * Start the apps that were started before exit.
     * @param {boolean} [immediate] -- Resolve the returned promise immediately after the command has been transmitted.
     * @returns {Promise.<resurrectResult>}
     */
    async resurrect(immediate = false): Promise<ResurrectResult> {
        this._impossibleInappz();

        return this._connectAndSend({
            name: "resurrect",
            immediate,
        });
    }

    /**
     * @typedef appOptions
     * @property {string} [name] - The name of the app.
     * @property {number[]} [ports] - The prots that yoru app listens to.
     * @property {number} [workers] - The number of workers to start for your app. (default: number of CPUs)
     * @property {string} [output] - A directory for the log files. (default: ~/.appz/<appname>)
     */

    /**
     * @typedef startResult
     * @property {string} app - The name of the app.
     * @property {string} dir - The directory of the app.
     * @property {number} started - The number of started workers.
     * @property {number[]} ports - The ports that your app listens to.
     */

    /**
     * Start the app in the given directory.
     * @param {string} dir - Directory of the app.
     * @param {string[]} [args] - Arguments for the app.
     * @param {appOptions} [opt] - Options that overwrite the ones from the package.json.
     * @param {{string: string}} [env] - Environment variables for the app.
     * @param {boolean} [immediate] - Resolve the returned promise immediately after the command has been transmitted.
     * @returns {Promise.<startResult>}
     */
    async start(
        dir: string,
        args = [],
        opt: AppOptions,
        env = {},
        immediate = false,
    ): Promise<StartResult> {
        const envi = Object.assign({}, process.env, env);
        return this._connectAndSend({
            name: "start",
            dir: path.resolve(dir || ""),
            args,
            opt,
            env: envi,
            immediate,
        });
    }

    /**
     * Stop all workers of an app.
     * @param {string} app - The name of th app.
     * @param {killOptions} [opt] - Options for the command.
     * @param {boolean} [immediateResolve] - Resolve the returned promise immediately after the command has been transmitted.
     * @returns {Promise.<stopResult>}
     */
    async stop(
        app: string,
        opt: KillOptions,
        immediate = false,
    ): Promise<StopResult> {
        opt.timeout = parseTimeout(opt.timeout);
        return this._connectAndSend({
            name: "stop",
            app,
            opt,
            immediate,
        });
    }

    /**
     * Restart an app.
     * @param {string} app - The name of the app.
     * @param {killOptions} [opt] - Options for the command.
     * @param {boolean} [immediate] - Resolve the returned promise immediately after the command has been transmitted.
     * @returns {Promise.<restartResult>}
     */
    async restart(
        app: string,
        opt: KillOptions,
        immediate = false,
    ): Promise<unknown> {
        opt.timeout = parseTimeout(opt.timeout);
        return this._connectAndSend({
            name: "restart",
            app,
            opt,
            immediate,
        });
    }

    /**
     * @typedef restartAllResult
     * @property {number} started - The number of started workers.
     * @property {number} killed - The number of killed workers
     */

    /**
     * Restart all apps.
     * @param {killOptions} [opt] - Options for the command.
     * @param {boolean} [immediate] - Resolve the returned promise immediately after the command has been transmitted.
     * @returns {Promise.<restartAllResult>}
     */
    async restartAll(
        opt: KillOptions,
        immediate = false,
    ): Promise<RestartAllResult> {
        opt.timeout = parseTimeout(opt.timeout);
        return this._connectAndSend({
            name: "restart-all",
            opt,
            immediate,
        });
    }

    /**
     * Stop the appz daemon.
     * @returns {Promise.<void>}
     */
    async exit(): Promise<void> {
        await this._connectAndSend({
            name: "exit",
        });

        await this._waitForDisconnect();
    }

    /**
     * Upgrade the appz daemon to a new version. Do not call this in a child process of appz!
     * @returns {Promise.<void>}
     */
    async upgrade(): Promise<void> {
        this._impossibleInappz();

        await this.exit();
        await this.resurrect();
    }

    /**
     * @typedef infoResult
     * @property {string} name - The name of the app.
     * @property {string} dir - Directory of the app.
     * @property {number[]} ports - Ports that the app uses.
     * @property {number} pending - Number of pending workers.
     * @property {number} available - Number of available workers.
     * @property {number} killed - Number of killed workers.
     * @property {number} reviveCount - Shows how often the app has been revived.
     */

    /**
     * Get detailed information about an app.
     * @param {string} app - The name of the app.
     * @returns {Promise.<infoResult>}
     */
    async info(app: string): Promise<InfoResult> {
        return this._connectAndSend({
            name: "info",
            app,
        });
    }

    /**
     * @typedef listAppStats
     * @property {string} dir - Directory of the app.
     * @property {number[]} ports - Ports that the app uses.
     * @property {number} pending - Number of pending workers.
     * @property {number} available - Number of available workers.
     * @property {number} killed - Number of killed workers.
     */

    /**
     * @typedef listResult
     * @property {boolean} isResurrectable - Is true if the resurrect command can be used.
     * @property {{string: listAppStats}} stats - Statistics for each app.
     */

    /**
     * Get a list of all running apps.
     * @returns {Promise.<listResult>}
     */
    async list(): Promise<ListResult> {
        return this._connectAndSend({
            name: "list",
        });
    }

    async logs(app: string): Promise<unknown> {
        return this._connectAndSend({
            name: "logs",
            app,
        });
    }

    /**
     * Throws an error if called within a subprocess/worker of appz.
     * @returns {void}
     */
    _impossibleInappz(): void {
        if (process.env.APPNAME && this.ready) {
            throw new Error(
                "It is impossible to use this operation within apps that are managed with appz",
            );
        }
    }

    /**
     * Returns a promise that resolves when the ping command was successful.
     * @returns {Promise.<void>}
     */
    async _ping(): Promise<void> {
        await this._send({
            name: "ping",
        });
    }

    /**
     * Returns a promise that resolves when the daemon is not available anymore.
     * @returns {Promise.<void>}
     */
    async _waitForDisconnect(): Promise<void> {
        while (1) {
            try {
                await this._ping();
                await xTime(100);
            } catch (err) {
                if (err.code === "ECONNREFUSED" || err.code === "ENOENT") {
                    break;
                }
                throw err;
            }
        }
    }

    /**
     * Returns a promise that resolves as soon as the daemon is available.
     * @returns {Promise.<void>}
     */
    async _waitForConnection(): Promise<void> {
        while (1) {
            try {
                await this._ping();
                return;
            } catch (err) {
                if (err.code === "ECONNREFUSED" || err.code === "ENOENT") {
                    await xTime(100);
                    continue;
                }
                throw err;
            }
        }
    }

    /**
     * Sends a command to the server.
     * @param {Object} object - An object representing the command.
     * @returns {Promise.<*>} - The result of the command.
     */
    async _send(object: unknown): Promise<never> {
        return new Promise((resolve, reject) => {
            const socket = net.connect(this.socketFile, () => {
                const connection = new RemoteEventEmitter(socket);

                connection.remoteEmit("command", object);

                const SIGINTHandler = () => {
                    connection.remoteEmit("SIGINT");
                };

                process.once("SIGINT", SIGINTHandler);

                connection.on("result", (result) => {
                    resolve(result);
                    process.removeListener("SIGINT", SIGINTHandler);
                    connection.close();
                });

                connection.on("stdout", (chunk) => {
                    const buffer = Buffer.from(chunk);
                    this.emit("stdout", buffer);
                });

                connection.on("stderr", (chunk) => {
                    const buffer = Buffer.from(chunk);
                    this.emit("stderr", buffer);
                });

                connection.once("error", (err) => {
                    reject(err);
                    connection.close();
                });
            });

            socket.once("error", reject);
        });
    }

    /**
     * Sends a command to the daemon. It starts the daemon if it is not running.
     * @param {Object} object - An object representing the command.
     * @param {function} connectionHandler - Call this with the connection object.
     * @returns {Promise.<*>} - The result of the command.
     */
    async _connectAndSend(object: Record<string, unknown>): Promise<never> {
        await this._connect();
        return this._send(object);
    }

    /**
     * Returns true if the daemon is online.
     * @returns {Promise.<boolean>}
     */
    async _isOnline(): Promise<boolean> {
        try {
            await this._ping();
            return true;
        } catch (err) {
            if (err.code !== "ECONNREFUSED" && err.code !== "ENOENT") {
                throw err;
            }

            return false;
        }
    }

    /**
     * Tries to connect to the daemon. It starts the daemon if it is not running.
     * @returns {Promise.<void>}
     */
    async _connect(): Promise<void> {
        const online = await this._isOnline();

        if (!online) {
            await this._startDaemon();
        }
    }

    /**
     * Start the daemon.
     * @returns {Promise.<void>} - Returns a promise that resolves after the daemon is started.
     */
    async _startDaemon(options?: cp.SpawnOptions): Promise<void> {
        const file = path.join(__dirname, "..", "daemon", "index.js");
        const extraOpts: cp.ForkOptions = {
            stdio: "ignore", // "ignore"
            detached: true, // true
        };
        const spawnOptions: cp.ForkOptions = Object.assign(extraOpts, options);

        const p = cp.fork(require.resolve(file), [], spawnOptions);

        const error = once(p, "error", true).then((err) =>
            handle(new Error(err as never)),
        );

        const exit = once(p, "exit", true).then((code) => {
            if (code)
                throw new Error(
                    `Unable to start daemon. Exited with code "${code}".`,
                );
        });

        p.unref();

        return await Promise.race([error, exit, this._waitForConnection()]);
    }
}
