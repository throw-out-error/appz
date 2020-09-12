import net = require("net");
import path from "path";
import fs from "mz/fs";
import { Connection, RemoteEventEmitter } from "@throw-out-error/better-events";
import appz from "..";
import { CodeError } from "@throw-out-error/throw-out-utils";
import { handle } from "../lib/log";

const OPT = {
    allowHalfOpen: false,
};

let rm: net.Server | undefined;

/**
 * Creates a UNIX server to communicate with the appz API.
 * @param {string} filename - The name for the UNIX socket.
 * @param {function} run - A function that gets called every time an object is received.
 */
function remoteServer(
    filename: string,
    run: (data: any, connection: RemoteEventEmitter) => Promise<any>,
): net.Server {
    const file = path.resolve(filename);

    rm = net.createServer(OPT, (socket) => {
        socket.on("error", handle);

        const connection = new RemoteEventEmitter(socket);

        connection.on("error", (error) => {
            connection.remoteEmit("error", error);
        });

        connection.on("command", async (data: never) => {
            try {
                const result = await run(data, connection);
                connection.remoteEmit("result", result);
            } catch (err) {
                connection.remoteEmit("error", err);
            }
        });

        const SIGINT = connection.once("SIGINT").then(() => {
            const msg =
                'Received "SIGINT" fromCLI. No new workers were started.';

            const error = new CodeError(msg, "SIGINT");

            throw error;
        });

        SIGINT.catch(() => {
            // prevent unhandled promise rejection warning
        });
    });

    if (!process.env.TEST) {
        rm.listen(file);
    }

    rm.on("error", async (err: CodeError) => {
        if (err.code !== "EADDRINUSE") {
            handle(err);
            // try to restart server
            remoteServer(filename, run);
            return;
        }

        const online = await appz._isOnline();

        if (online) {
            console.log(
                "Another daemon process is running. Exiting with exit code 0.",
            );
            process.exit(0);
        } else {
            await fs.unlink(filename);
            console.log("Dead socket removed.");
            remoteServer(filename, run);
        }
    });

    return rm;
}

export { remoteServer, Connection, rm };
