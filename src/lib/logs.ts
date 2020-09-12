import util from "util";
import fs from "fs";

import LogManager from "./log-manager";
import { CodeError } from "@throw-out-error/throw-out-utils";

/**
 * Format items of all kind into a string like console.log() does.
 * @param {*} stuff
 * @returns {string}
 */
export function logify(...stuff: unknown[]): string {
    return stuff
        .map((item) => {
            if (typeof item === "object" || typeof item === "undefined") {
                return util.inspect(item);
            } else {
                return item;
            }
        })
        .join(" ");
}

const lm = new LogManager();

try {
    fs.mkdirSync("appz");
} catch (err) {
    if (err.code !== "EEXIST") {
        throw err;
    }
}

const appzLogs = lm.setup("appz", "appz");

export const handle = (err: CodeError): void => {
    console.error(err);
    appzLogs.err.write(util.inspect(err) + "\n");

    if (err.code === "MODULE_NOT_FOUND") {
        throw err;
    }
};

export const log = (...stuff: unknown[]): void => {
    console.log(...stuff);
    appzLogs.log.write(logify(...stuff));

    appzLogs.log.write("\n");
};

export default lm;
