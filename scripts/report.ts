// Prints the analysis of a local folder of postings: tsx scripts/report.ts <dir>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, type Posting } from "core";

const dir = process.argv[2];
if (!dir) throw new Error("usage: report.ts <dir>");
const postings = readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file): Posting => ({ id: file.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(dir, file), "utf8")) }));
console.log(JSON.stringify(analyze(postings), null, 2));
