#! /usr/bin/env node

import path from "path";
import fs from "fs";
import operations from "./operation";
import { getConfig } from "../lib/imports";
import { Worker } from "./worker";
import { remoteServer } from "./remote-server";
import { handle } from "../lib/log";
import { log } from "../lib/logs";
import { Server } from "net";

export async function startDaemon(): Promise<Server> {
    const appzDir = path.join(process.env.HOME, ".appz");

    try {
        fs.mkdirSync(appzDir);
    } catch (err) {
        if (err.code !== "EEXIST") {
            throw err;
        }
    }

    process.chdir(appzDir);

    process.on("uncaughtException", handle);
    Worker.errorHandler = handle;

    const config = getConfig("1.0.0");

    const server = remoteServer("sick.sock", async (command, connection) => {
        if (process.env.NODE_ENV === "development")
            log("daemon: run command", command.name);

        if (!operations.hasOwnProperty(command.name))
            throw new Error(`Unknown operation "${command.name}".`);

        try {
            if (command.immediate) {
                await operations[command.name](config, command, connection);
                return {};
            }

            return await operations[command.name](config, command, connection);
        } catch {
            handle(new Error(`Operation ${command.name} not found.`));
        }
    });

    console.log("daemon: daemon started");
    return server;
}

startDaemon();
