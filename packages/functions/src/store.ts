import { BatchWriteCommand, QueryCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Report } from "core";

type Client = Pick<DynamoDBDocumentClient, "send">;
type Item = Record<string, unknown> & { pk: string; sk: string };

const PARTITIONS = ["SUMMARY", "TECH", "POSTING", "FILTERED"] as const;
const BATCH_SIZE = 25; // DynamoDB's limit for one BatchWriteItem call
const MAX_ATTEMPTS = 5;

const toItems = (report: Report): Item[] => [
  { pk: "SUMMARY", sk: "latest", ...report.summary },
  ...report.technologies.map((technology) => ({ pk: "TECH", sk: technology.name, ...technology })),
  ...report.postings.map((posting) => ({ pk: "POSTING", sk: posting.id, ...posting })),
  ...report.filtered.map((posting) => ({ pk: "FILTERED", sk: `${posting.company}#${posting.title}`, ...posting })),
];

const queryPartition = async (client: Client, table: string, pk: string): Promise<Item[]> => {
  const items: Item[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await client.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: start,
      }),
    );
    items.push(...((page.Items ?? []) as Item[]));
    start = page.LastEvaluatedKey;
  } while (start);
  return items;
};

/** Writes in batches, resending anything DynamoDB hands back as unprocessed. */
const batchWrite = async (client: Client, table: string, requests: object[]): Promise<void> => {
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    let pending = requests.slice(i, i + BATCH_SIZE);
    for (let attempt = 1; pending.length > 0; attempt++) {
      if (attempt > MAX_ATTEMPTS) throw new Error(`${pending.length} writes unprocessed after ${MAX_ATTEMPTS} attempts`);
      const result = await client.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
      pending = result.UnprocessedItems?.[table] ?? [];
      if (pending.length > 0) await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 50));
    }
  }
};

/** Replaces the stored report, deleting rows the new report no longer contains. */
export const saveReport = async (client: Client, table: string, report: Report): Promise<void> => {
  const items = toItems(report);
  const keep = new Set(items.map(({ pk, sk }) => `${pk}\0${sk}`));
  const existing = (await Promise.all(PARTITIONS.map((pk) => queryPartition(client, table, pk)))).flat();
  const stale = existing.filter(({ pk, sk }) => !keep.has(`${pk}\0${sk}`));
  await batchWrite(client, table, [
    ...items.map((Item) => ({ PutRequest: { Item } })),
    ...stale.map(({ pk, sk }) => ({ DeleteRequest: { Key: { pk, sk } } })),
  ]);
};

const strip = <T>(items: Item[]): T[] => items.map(({ pk: _pk, sk: _sk, ...rest }) => rest as T);

export const loadReport = async (client: Client, table: string): Promise<Report> => {
  const [summary, technologies, postings, filtered] = await Promise.all(
    PARTITIONS.map((pk) => queryPartition(client, table, pk)),
  );
  const empty: Report["summary"] = { analyzed: 0, fromUrls: 0, fromSearch: 0, filtered: 0, empty: 0 };
  return {
    summary: strip<Report["summary"]>(summary ?? [])[0] ?? empty,
    technologies: strip<Report["technologies"][number]>(technologies ?? []).sort(
      (a, b) => b.firm - a.firm || b.mentions - a.mentions || (a.name < b.name ? -1 : 1),
    ),
    postings: strip(postings ?? []),
    filtered: strip(filtered ?? []),
  };
};
