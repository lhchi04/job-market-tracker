import { BatchWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Report } from "core";
import { describe, expect, it } from "vitest";
import { loadReport, saveReport } from "./store";

type Row = Record<string, any>;

/** An in-memory table that answers the two commands the store uses. */
const fakeTable = (rows: Row[] = [], unprocessedOnce = false) => {
  const state = { rows, batches: [] as number[] };
  let rejectNext = unprocessedOnce;
  const send = async (command: unknown): Promise<any> => {
    if (command instanceof QueryCommand) {
      const pk = command.input.ExpressionAttributeValues?.[":pk"];
      return { Items: state.rows.filter((row) => row.pk === pk) };
    }
    if (command instanceof BatchWriteCommand) {
      const requests = command.input.RequestItems!.t!;
      state.batches.push(requests.length);
      if (rejectNext) {
        rejectNext = false;
        return { UnprocessedItems: { t: requests } };
      }
      for (const { PutRequest, DeleteRequest } of requests) {
        const key = PutRequest?.Item ?? DeleteRequest?.Key;
        state.rows = state.rows.filter((row) => row.pk !== key!.pk || row.sk !== key!.sk);
        if (PutRequest) state.rows.push(PutRequest.Item!);
      }
      return {};
    }
    throw new Error("unexpected command");
  };
  return { send, state } as unknown as { send: never; state: typeof state };
};

const report = (overrides: Partial<Report> = {}): Report => ({
  summary: { analyzed: 1, fromUrls: 0, fromSearch: 1, filtered: 0, empty: 0 },
  technologies: [{ name: "AWS", firm: 1, mentions: 1, evidence: false }],
  postings: [{ id: "a", source: "linkedin", title: "SWE", company: "Acme", location: "NY", collected: "2026-10-30" }],
  filtered: [],
  ...overrides,
});

describe("saveReport and loadReport", () => {
  it("round-trips a report", async () => {
    const table = fakeTable();
    await saveReport(table, "t", report());
    expect(await loadReport(table, "t")).toEqual(report());
  });

  it("returns an empty report from an empty table", async () => {
    expect(await loadReport(fakeTable(), "t")).toMatchObject({
      summary: { analyzed: 0 },
      technologies: [],
    });
  });

  it("removes rows the new report no longer contains", async () => {
    const table = fakeTable();
    await saveReport(table, "t", report());
    await saveReport(table, "t", report({ technologies: [{ name: "Go", firm: 1, mentions: 1, evidence: false }] }));
    expect((await loadReport(table, "t")).technologies.map(({ name }) => name)).toEqual(["Go"]);
  });

  it("sorts technologies by rank on load", async () => {
    const table = fakeTable();
    const technologies = [
      { name: "A", firm: 1, mentions: 5, evidence: false },
      { name: "B", firm: 3, mentions: 3, evidence: false },
    ];
    await saveReport(table, "t", report({ technologies }));
    expect((await loadReport(table, "t")).technologies.map(({ name }) => name)).toEqual(["B", "A"]);
  });

  it("splits writes into batches of 25", async () => {
    const table = fakeTable();
    const postings = Array.from({ length: 60 }, (_, i) => ({ ...report().postings[0]!, id: String(i) }));
    await saveReport(table, "t", report({ postings }));
    expect(table.state.batches).toEqual([25, 25, 12]);
  });

  it("resends writes DynamoDB leaves unprocessed", async () => {
    const table = fakeTable([], true);
    await saveReport(table, "t", report());
    expect(table.state.batches).toEqual([3, 3]);
    expect(table.state.rows).toHaveLength(3);
  });
});
