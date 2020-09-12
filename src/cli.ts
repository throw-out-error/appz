#! /usr/bin/env node

import program from "commander";
import colors from "colors/safe";

import { getAppName } from "./lib/app";
import logResult, { handle, heading } from "./lib/log";
import appz from ".";
import parser from "./lib/parser";

async function main() {
    const SPACER = "--";

    const argv = process.argv.slice();
    let args = [];
    if (argv.includes(SPACER)) {
        args = argv.splice(argv.indexOf(SPACER));
        args.shift();
    }

    program
        .version("1.0.0")
        .option("-V <version>", "version")
        .action(function (cmd) {
            handle(new Error(`command "${cmd._name}" not found`));
        });

    program
        .command("resurrect")
        .description("start the apps that were started before exit")
        .option("-i, --immediate", "exit immediately")
        .action((opts) => {
            appz.resurrect(opts.immediate)
                .then((data) => {
                    if (opts.immediate) return;
                    logResult(data);
                })
                .catch(handle);
        });

    program
        .command("start [dir]")
        .usage("[options] [dir] [-- [arguments]]")
        .description("start the app in the dir")
        .option("-n, --app-name <appname>", "name of your app")
        .option(
            "-p, --ports <ports>",
            "ports that your app listens to",
            parser.ports,
        )
        .option(
            "-w, --workers <workers>",
            "count of workers (default: number of CPUs)",
            parseInt,
        )
        .option(
            "-o, --output <output>",
            "directory for the log files of this app",
            parser.path,
        )
        .option("-i, --immediate", "exit immediately")
        .action((dir, opts) => {
            // prepare opts
            const opt = {
                name: opts.appName,
                workers: opts.workers,
                ports: opts.ports,
                output: opts.output,
            };

            const env = {};

            appz.start(dir, args, opt, env, opts.immediate)
                .then((data) => {
                    if (opts.immediate) return;
                    logResult(data);
                })
                .catch(handle);
        });

    const appName = await getAppName();

    program
        .command("stop [appname]")
        .description("stop the app specified by the appname")
        .option("-t, --timeout <timeout>", "time until the workers get killed")
        .option("-s, --signal <signal>", "kill signal")
        .option("-i, --immediate", "exit immediately")
        .action((appname = appName, opts) => {
            const opt = {
                timeout: opts.timeout,
                signal: opts.signal,
            };
            appz.stop(appname, opt, opts.immediate)
                .then((data) => {
                    if (opts.immediate) return;
                    logResult(data);
                })
                .catch(handle);
        });

    program
        .command("restart [appname]")
        .description("restart the app specified by the appname")
        .option(
            "-t, --timeout <timeout>",
            "time until the old workers get killed",
        )
        .option("-s, --signal <signal>", "kill signal for the old workers")
        .option("-i, --immediate", "exit immediately")
        .action((appname = appName, opts) => {
            const opt = {
                timeout: opts.timeout,
                signal: opts.signal,
            };
            appz.restart(appname, opt, opts.immediate)
                .then((data) => {
                    if (opts.immediate) return;
                    logResult(data);
                })
                .catch(handle);
        });

    program
        .command("restart-all")
        .description("restart all apps")
        .option(
            "-t, --timeout <timeout>",
            "time until the old workers get killed",
        )
        .option("-s, --signal <signal>", "kill signal for the old workers")
        .option("-i, --immediate", "exit immediately")
        .action((opts) => {
            const opt = {
                timeout: opts.timeout,
                signal: opts.signal,
            };
            appz.restartAll(opt, opts.immediate)
                .then((data) => {
                    if (opts.immediate) return;
                    logResult(data);
                })
                .catch(handle);
        });

    program
        .command("logs [appname]")
        .description("show the output of an app")
        .action((appname = appName) => {
            appz.logs(appname).catch(handle);
        });

    program
        .command("info [appname]")
        .description("show specific infos about an app")
        .option("--app-name", "output the appname")
        .option("--dir", "output the directory of the app")
        .option("--ports", "output the ports that the app uses")
        .option("--pending", "output the number of pending workers")
        .option("--available", "output the number of available workers")
        .option("--killed", "output the number of killed workers")
        .option("--revive-count", "output how often the app has been revived")
        .action((appname = appName, opts) => {
            appz.info(appname)
                .then((stats) => {
                    const props = [
                        "appName",
                        "dir",
                        "ports",
                        "pending",
                        "available",
                        "killed",
                        "reviveCount",
                    ];
                    const prop = props.find((prop) =>
                        opts.hasOwnProperty(prop),
                    );
                    if (prop) {
                        const value = stats[prop];
                        if (Array.isArray(value)) {
                            console.log(value.join() || "-");
                        } else {
                            console.log(value);
                        }
                        process.exit(0);
                    }

                    console.log("name:", stats.name);
                    console.log("directory:", stats.dir);
                    console.log("ports:", stats.ports.join() || "-");
                    console.log("workers:");
                    console.log("  pending:", stats.pending);
                    console.log("  available:", stats.available);
                    console.log("  killed:", stats.killed);
                    console.log("revive count:", stats.reviveCount);
                })
                .catch(handle);
        });

    program
        .command("list")
        .description("overview of all running workers")
        .option("-m, --minimal", "minimalistic list (easy to parse)")
        .action((opt) => {
            appz.list()
                .then((data) => {
                    const props = Object.keys(data.stats);

                    if (opt.minimal) {
                        console.log(props.join(" "));
                        return;
                    }

                    heading("workers ports     name                 directory");

                    props.forEach((name) => {
                        const app = data.stats[name];

                        let workers = colors.bold(
                            `${app.available}/${app.workers}`.padEnd(7),
                        );
                        if (app.available < app.workers) {
                            workers = colors.red(workers);
                        } else if (app.available > app.workers) {
                            workers = colors.yellow(workers);
                        } else {
                            workers = colors.green(workers);
                        }

                        const ports = app.ports.join() || "-";

                        console.log(
                            `${workers} ${ports.padEnd(9)} ${name.padEnd(20)} ${
                                app.dir
                            }`,
                        );
                    });

                    if (data.isResurrectable) {
                        console.log();
                        console.log(
                            colors.dim(
                                "The listed apps are currently not running.",
                            ),
                        );
                        console.log(
                            colors.dim(
                                'You can use "appz resurrect" to start them.',
                            ),
                        );
                    }
                })
                .catch(handle);
        });

    program
        .command("exit")
        .description("kill the appz daemon")
        .action(() => {
            appz.exit()
                .then(() => {
                    console.log("daemon stopped");
                })
                .catch(handle);
        });

    if (!process.env.TEST) {
        if (process.argv.length === 2) {
            program.outputHelp();
        }

        program.parse(argv);
    }
}

main();
