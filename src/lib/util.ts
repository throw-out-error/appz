const dev = process.env.NODE_ENV === "development";
const DEFAULT_VALUE = dev ? 0 : 30000; // 0 or 30s

/**
 * If timeout === undefined it returns the default timeout.
 * If the timeout is a Number it returns the timeout.
 * @param {string|number} timeout
 * @returns {string|number}
 */
export function parseTimeout(timeout = DEFAULT_VALUE): number {
    if (isNaN(timeout)) {
        throw new TypeError("Timeout must be a number, undefined or Infinity.");
    }

    return +timeout;
}

/**
 * Creates a date string of the format "YYYY-MM-DD".
 * @param {Date} date - The date to stringify.
 * @returns {string}
 */
export function formatDate(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth().toString().padStart(2, "0");
    const day = date.getUTCDate().toString().padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function mergePorts(...portArrays) {
    const known = [];
    return [].concat(...portArrays).filter((port) => {
        if (!known.includes(port)) {
            known.push(port);
            return true;
        }
    });
}

export default {
    isResurrectable: false,
};

export function verifyPorts(pack, prop, origin = "package.json") {
    const ports = pack[prop];

    if (Array.isArray(ports)) {
        if (ports.length) {
            // remove non-numeral ports
            const numeralPorts = pack[prop].filter(
                (p) => typeof p === "number",
            );

            // remove duplicates
            const valid = mergePorts(numeralPorts);

            if (valid.length !== pack[prop].length) {
                throw new Error(`invalid ${prop} in ${origin}`);
            }

            // everything ok
            return;
        }
    } else if (ports) {
        // wrong type
        throw new TypeError(
            prop + " in package.json must be an array or undefined",
        );
    }

    // undefined or empty array
    pack[prop] = null;
}
