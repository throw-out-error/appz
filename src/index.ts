import path from "path";

import Remote from "./lib/remote";

const appzsocket = path.join(process.env.HOME, ".appz", "sick.sock");

const appz = new Remote(appzsocket);

export default appz;
