import { describe, expect, it } from "vitest";
import { analyze, type Posting } from "./index";

const posting = (description: string, overrides: Partial<Posting> = {}): Posting => ({
  id: overrides.title ?? description.slice(0, 20),
  source: "linkedin",
  origin: "search",
  title: description.slice(0, 20),
  company: "Acme",
  location: "Remote",
  collected: "2026-10-30",
  description,
  ...overrides,
});

const count = (postings: Posting[], name: string) =>
  analyze(postings).technologies.find((tech) => tech.name === name);

describe("technology matching", () => {
  it("counts a posting once however often the technology appears", () => {
    expect(count([posting("AWS, AWS and more AWS")], "AWS")).toMatchObject({ firm: 1, mentions: 1 });
  });

  it("ignores case for ordinary technologies", () => {
    expect(count([posting("Experience with typescript")], "TypeScript")?.mentions).toBe(1);
  });

  it("does not match a technology inside a longer word", () => {
    expect(count([posting("Javascript and rustic charm")], "Java")).toBeUndefined();
    expect(count([posting("Javascript and rustic charm")], "Rust")).toBeUndefined();
  });

  it("treats Go as case sensitive so the verb does not count", () => {
    expect(count([posting("You will go, and go on to lead")], "Go")).toBeUndefined();
    expect(count([posting("Strong in Go, and Docker")], "Go")?.mentions).toBe(1);
  });

  it("keeps C, C++ and C# apart", () => {
    expect(count([posting("Knows C++ well")], "C")).toBeUndefined();
    expect(count([posting("Knows C++ well")], "C#")).toBeUndefined();
    expect(count([posting("Knows C# well")], "C#")?.mentions).toBe(1);
  });

  it("omits technologies nobody mentioned", () => {
    expect(count([posting("Python only")], "Kafka")).toBeUndefined();
  });

  it("marks whether there is evidence for a technology", () => {
    const { technologies } = analyze([posting("Python and Azure")]);
    expect(technologies.find((tech) => tech.name === "Python")?.evidence).toBe(true);
    expect(technologies.find((tech) => tech.name === "Azure")?.evidence).toBe(false);
  });
});

describe("firm versus option-only mentions", () => {
  const list = "Proficient in a language such as Python, Java, C++ or Go.";

  it("does not count a mention that only sits in an either-or language list", () => {
    expect(count([posting(list)], "Java")).toMatchObject({ firm: 0, mentions: 1 });
  });

  it("counts it as firm when another sentence names it on its own", () => {
    expect(count([posting(`${list} Our backend is written in Java.`)], "Java")).toMatchObject({
      firm: 1,
      mentions: 1,
    });
  });

  it("needs at least three languages to call something a list", () => {
    expect(count([posting("Use Python or Java daily.")], "Java")?.firm).toBe(1);
  });

  it("does not split sentences on the dot in Node.js", () => {
    expect(count([posting("Use Python, Java, Ruby or Node.js here.")], "Node.js")?.mentions).toBe(1);
  });
});

describe("posting selection", () => {
  it("collapses reposts with the same company and title prefix", () => {
    const first = posting("AWS role", { title: "Software Engineer", company: "ACME" });
    const repost = posting("AWS role", { id: "other", title: "software engineer", company: "acme" });
    const report = analyze([first, repost]);
    expect(report.summary.analyzed).toBe(1);
    expect(report.postings).toHaveLength(1);
  });

  it("removes citizenship and clearance postings and lists them", () => {
    const report = analyze([
      posting("Must be a U.S. citizen. Python.", { title: "A" }),
      posting("Active secret clearance. Python.", { title: "B" }),
      posting("Python.", { title: "C" }),
    ]);
    expect(report.summary).toMatchObject({ analyzed: 1, filtered: 2 });
    expect(report.filtered.map((item) => item.title)).toEqual(["A", "B"]);
    expect(report.technologies.find((tech) => tech.name === "Python")?.mentions).toBe(1);
  });

  it("counts postings with no description separately", () => {
    expect(analyze([posting("", { title: "Empty" })]).summary).toMatchObject({ analyzed: 0, empty: 1 });
  });

  it("splits analyzed postings by origin, treating a missing origin as search", () => {
    const { origin: _, ...noOrigin } = posting("Java", { title: "Y" });
    const report = analyze([posting("Python", { title: "X", origin: "inbox" }), noOrigin]);
    expect(report.summary).toMatchObject({ fromUrls: 1, fromSearch: 1 });
  });

  it("handles an empty input", () => {
    expect(analyze([])).toMatchObject({ technologies: [], postings: [], filtered: [] });
  });
});

describe("ranking", () => {
  it("orders by firm, then mentions, then name", () => {
    const report = analyze([
      posting("Docker and Redis", { title: "1" }),
      posting("Redis and Kafka", { title: "2" }),
    ]);
    expect(report.technologies.map((tech) => tech.name)).toEqual(["Redis", "Docker", "Kafka"]);
  });
});
