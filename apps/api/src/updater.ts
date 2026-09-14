import { resolve } from "node:path";
import { applyUpdate } from "./updater/engine";
import { serveUpdater } from "./updater/service";

const [mode, home, id] = process.argv.slice(2);
if (!home || resolve(home) !== home || home.includes(","))
  throw new Error("An absolute Studio state directory is required.");
if (mode === "serve") await serveUpdater(home);
else if (mode === "apply" && id) await applyUpdate(home, id);
else throw new Error("Expected serve <home> or apply <home> <operation-id>.");
