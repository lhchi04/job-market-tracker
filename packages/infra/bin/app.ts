import { App } from "aws-cdk-lib";
import { fileURLToPath } from "node:url";
import { TrackerStack } from "../lib/tracker-stack";

const siteDir = fileURLToPath(new URL("../../web/dist", import.meta.url));

new TrackerStack(new App(), "JobMarketTracker", { siteDir });
