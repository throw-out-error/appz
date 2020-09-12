import path = require("path");
import assert from "assert";
import { handle, log } from "./log";

/**
 * Get the name of the app from the current cwd.
 * @returns string
 */
export async function getAppName(): Promise<string> {
    log("no appname given");
    log("searching directory for package.json");
    try {
        const file = path.join(process.cwd(), "package.json");
        const pack = await require(file);
        assert(pack.name, "name not specified in package.json");
        log(`found name "${pack.name}" in package.json`);
        return pack.name;
    } catch (err) {
        console.error(`no package.json file found`);
        handle(new Error("missing argument `appname'"));
    }
}
