import { Worker } from "../daemon/worker";
import { PassThrough, Writable } from "stream";

export type AppOptions = {
    name: string;
    /**
     * The prots that yoru app listens to.
     */
    ports: number[];
    /**
     * The number of workers to start for your app. (default: number of CPUs)
     */
    workers: number;
    /**
     * A directory for the log files. (default: ~/.appz/<appname>)
     */
    output: string;
};

export type App = {
    name: string;
    dir: string;
    opt?: AppOptions;
    args?: string[];
    env?: Record<string, string>;
    reviveCount?: number;
    workers?: Worker[];
};

export type KillOptions = {
    /**
     * The kill signal for the workers.
     */
    signal?: string;
    /**
     * The time (in ms) until the workers get force-killed.
     */
    timeout?: number;
};

export type ListAppStats = {
    dir?: string;
    ports?: number[];
    pending?: number;
    available?: number;
    killed?: number;
    workers?: number;
};

export type ListResult = {
    isResurrectable: boolean;
    stats: Record<string, ListAppStats>;
};

export type InfoResult = {
    name: string;
    dir: string;
    ports: number[];
    killed: number;
    available: number;
    pending: number;
    reviveCount: number;
};

export type RestartAllResult = {
    started: number;
    killed: number;
};

export type StopResult = {
    app: string;
    killed: number;
};

export type StartResult = {
    app: string;
    killed: number;
};

export type WorkerStartResult = {
    app: string;
    dir: string;
    started: number;
    killed?: number;
    ports: number[];
};

export type ResurrectResult = {
    started: number;
};

export type WorkerConfig = {
    apps: App[];
    save: () => void;
};

export type Package = {
    name: string;
    workers?: number;
};

export type Stream = {
    log: PassThrough;
    err: PassThrough;
    logStream?: Writable;
    errStream?: Writable;
    timeout?: NodeJS.Timeout;
};
