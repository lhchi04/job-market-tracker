import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { analyze, type Posting } from "core";
import { documentClient, requireEnv } from "./client";
import { saveReport } from "./store";

const PREFIX = "postings/";
const CONCURRENT_READS = 20;

type Storage = Pick<S3Client, "send">;

const listKeys = async (storage: Storage, bucket: string): Promise<string[]> => {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await storage.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }),
    );
    keys.push(...(page.Contents ?? []).flatMap(({ Key }) => (Key?.endsWith(".json") ? [Key] : [])));
    token = page.NextContinuationToken;
  } while (token);
  return keys.sort();
};

const readPosting = async (storage: Storage, bucket: string, key: string): Promise<Posting | undefined> => {
  const { Body } = await storage.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = (await Body?.transformToString()) ?? "";
  try {
    return { ...JSON.parse(text), id: key.slice(PREFIX.length, -".json".length) };
  } catch {
    console.warn(JSON.stringify({ message: "skipped invalid posting", key }));
    return undefined;
  }
};

/** Reads every saved posting. Counts are always recomputed from the full set, so reruns are safe. */
export const readPostings = async (storage: Storage, bucket: string): Promise<Posting[]> => {
  const keys = await listKeys(storage, bucket);
  const postings: (Posting | undefined)[] = [];
  for (let i = 0; i < keys.length; i += CONCURRENT_READS) {
    const chunk = keys.slice(i, i + CONCURRENT_READS);
    postings.push(...(await Promise.all(chunk.map((key) => readPosting(storage, bucket, key)))));
  }
  return postings.filter((posting) => posting !== undefined);
};

export const handler = async (): Promise<void> => {
  const postings = await readPostings(new S3Client({}), requireEnv("BUCKET_NAME"));
  const report = analyze(postings);
  await saveReport(documentClient, requireEnv("TABLE_NAME"), report);
  console.log(JSON.stringify({ message: "report saved", read: postings.length, ...report.summary }));
};
