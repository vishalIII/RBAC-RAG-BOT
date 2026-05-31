import { register } from "node:module";
import { pathToFileURL } from "node:url";

process.env.TS_NODE_FILES ??= "true";

register("ts-node/esm", pathToFileURL("./"));
