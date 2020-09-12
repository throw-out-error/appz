import path from "path";
import fs from "fs";
import { cpus } from "os";
const cpuCount = cpus();
import { Package } from "./types";
import { verifyPorts } from "./util";

/**
 * @typedef config
 * @property {string} version
 * @property {Array} apps
 */

/**
 * Returns the config object.
 * @param {string} version - The current version of the daemon.
 * @returns {config}
 */
export function getConfig(version) {
    const configFile = path.resolve("config.json");
    let config;

    try {
        config = require(configFile);
    } catch (err) {
        if (err.code !== "MODULE_NOT_FOUND") {
            throw err;
        }
    }

    function save() {
        const content = JSON.stringify(config, null, 2);
        fs.writeFileSync(configFile, content);
    }

    if (!config) {
        config = {
            apps: [],
        };
    }

    config.save = save;

    if (config.version !== version) {
        config.version = version;
        save();
    }

    return config;
}

export async function getPack(
    dir: string,
    opt: {
        ports: number[];
        workers: number;
    },
    env: Record<string, string>,
): Promise<Package> {
    // reload package.json
    const packPath = path.join(dir, "package.json");
    const originalPackage = await require(packPath);
    const pack = Object.assign({}, originalPackage, opt);

    // name
    if (!pack.name) {
        throw new Error("name in package.json must be set");
    }

    if (opt.ports) {
        verifyPorts(opt, "ports", "options");
        pack.ports = opt.ports;
    }

    verifyPorts(pack, "ports");

    // set default value for ports
    pack.ports = pack.ports || [];

    // apply dev*
    if (env.NODE_ENV === "development") {
        // apply devPorts
        verifyPorts(pack, "devPorts");
        pack.ports = pack.devPorts || pack.ports;
        // apply devWorkers
        pack.workers =
            opt.workers || pack.devWorkers || originalPackage.workers;
    }

    pack.workers = Math.abs(+pack.workers) || cpuCount;

    return pack;
}
