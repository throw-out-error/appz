class AppStats {
    dir: string;
    pending: number;
    available: number;
    killed: number;
    ports: number[];
    name: string;
    reviveCount: number;

    constructor(dir: string) {
        this.dir = dir;
        this.pending = 0;
        this.available = 0;
        this.killed = 0;
        this.ports = [];
    }
}

export default AppStats;
