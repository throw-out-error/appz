import colors from "colors";
import logs from "./logs";

export function log(...msg: unknown[]): void {
    if (process.env.appz_DEBUG === "true") console.log(...msg);
}

export function handle(err: Error): void {
    if (process.env.appz_DEBUG === "true") console.error(err);
    else console.error(`\n  error: ${err.message}\n`);
    process.exit(1);
}

/**
 * Logs a horizontal line with the width of the terminal.
 */
export function heading(msg = ""): void {
    console.log(
        colors.inverse.dim(
            msg + " ".repeat(process.stdout.columns - msg.length),
        ),
    );
}

/**
 * @typedef result
 * @property {string} name
 * @property {number} started
 * @property {number} killed
 */

/**
 * Logs the contents of a result object.
 * @param {result} result
 */
function logResult(result: any): void {
    heading("workers ports     name");
    const name = result.app.padEnd(20);
    const started = ("+" + (result.started || 0)).padEnd(3);
    const killed = ("-" + (result.killed || 0)).padEnd(3);
    const ports = (result.ports ? result.ports.join() : "-").padEnd(9);

    console.log(
        `${colors.red.bold(killed)} ${colors.green.bold(
            started,
        )} ${ports} ${name}`,
    );
}

export default logResult;

/**
 * Send logs to CLI.
 * @param {string|*} target - The name of the app. Or a worker.
 * @param {*} connection - The connection to the CLI.
 */
export function sendLogs(target, connection) {
    const convert = (chunk) => Array.from(Buffer.from(chunk));
    const emit = (ev, chunk) => connection.remoteEmit(ev, convert(chunk));
    const sendOutToCLI = (chunk) => emit("stdout", chunk);
    const sendErrToCLI = (chunk) => emit("stderr", chunk);

    let streams;

    if (typeof target === "string") {
        streams = logs.get(target);

        streams.log.on("data", sendOutToCLI);
        streams.err.on("data", sendErrToCLI);
    } else {
        if (target.w && target.w.isConnected()) {
            const w = target.w;

            w.process.stdout.on("data", sendOutToCLI);
            w.process.stderr.on("data", sendErrToCLI);
        }
    }

    return {
        /**
         * Stop sending logs to CLI.
         */
        stop() {
            if (typeof target === "string") {
                streams.log.removeListener("data", sendOutToCLI);
                streams.err.removeListener("data", sendErrToCLI);
                return;
            }

            if (
                target &&
                target.w &&
                target.w.process &&
                target.w.process.stdout
            ) {
                const w = target.w;
                w.process.stdout.removeListener("data", sendOutToCLI);
                w.process.stderr.removeListener("data", sendErrToCLI);
            }
        },
    };
}
