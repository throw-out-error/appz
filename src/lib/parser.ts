import path from "path";

function ports(string) {
    return string.split(",").map((v) => +v);
}

function resolve(string = ".") {
    return path.resolve(string);
}

export default {
    ports,
    path: resolve,
};
