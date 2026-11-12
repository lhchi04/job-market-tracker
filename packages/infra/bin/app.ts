import { App } from "aws-cdk-lib";
import { TrackerStack } from "../lib/tracker-stack";

const siteOrigin = process.env.SITE_ORIGIN ?? "https://lhchi04.github.io";

new TrackerStack(new App(), "JobMarketTracker", { siteOrigin });
