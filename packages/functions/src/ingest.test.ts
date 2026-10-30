import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { readPostings } from "./ingest";

const posting = { source: "linkedin", id: "raw", title: "SWE", company: "Acme", location: "NY", description: "AWS", collected: "2026-10-30" };

const fakeBucket = (files: Record<string, string>, pageSize = 2) =>
  ({
    send: async (command: unknown): Promise<any> => {
      if (command instanceof ListObjectsV2Command) {
        const keys = Object.keys(files);
        const start = Number(command.input.ContinuationToken ?? 0);
        const end = start + pageSize;
        return {
          Contents: keys.slice(start, end).map((Key) => ({ Key })),
          NextContinuationToken: end < keys.length ? String(end) : undefined,
        };
      }
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToString: async () => files[command.input.Key!] } };
      }
      throw new Error("unexpected command");
    },
  }) as never;

describe("readPostings", () => {
  it("reads every page of the listing and uses the file name as the id", async () => {
    const files = Object.fromEntries(["c", "a", "b"].map((name) => [`postings/${name}.json`, JSON.stringify(posting)]));
    const postings = await readPostings(fakeBucket(files), "bucket");
    expect(postings.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("ignores objects that are not JSON files", async () => {
    const files = { "postings/a.json": JSON.stringify(posting), "postings/raw/a.html": "<html>" };
    expect(await readPostings(fakeBucket(files), "bucket")).toHaveLength(1);
  });

  it("skips a malformed file and keeps the rest", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const files = { "postings/a.json": "{oops", "postings/b.json": JSON.stringify(posting) };
    expect((await readPostings(fakeBucket(files), "bucket")).map(({ id }) => id)).toEqual(["b"]);
    expect(warn).toHaveBeenCalledOnce();
  });
});
