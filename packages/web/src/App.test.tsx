// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Report } from "core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const report: Report = {
  summary: { analyzed: 10, fromUrls: 1, fromSearch: 9, filtered: 2, empty: 0 },
  technologies: [
    { name: "AWS", firm: 5, mentions: 6, evidence: false },
    { name: "Python", firm: 2, mentions: 9, evidence: true },
  ],
  postings: [],
  filtered: [],
};

const respondWith = (response: Partial<Response>) =>
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("shows gaps first with their counts", async () => {
    respondWith({ ok: true, json: async () => report });
    render(<App />);
    expect(await screen.findByRole("rowheader", { name: "AWS" })).toBeTruthy();
    expect(screen.queryByRole("rowheader", { name: "Python" })).toBeNull();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("switches views", async () => {
    respondWith({ ok: true, json: async () => report });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Have evidence" }));
    expect(screen.getByRole("rowheader", { name: "Python" })).toBeTruthy();
    expect(screen.queryByRole("rowheader", { name: "AWS" })).toBeNull();
  });

  it("reports an API failure", async () => {
    respondWith({ ok: false, status: 500 });
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("500");
  });
});
