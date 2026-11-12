import { describe, expect, it } from "vitest";
import { checkPosting } from "./index";

const find = (description: string, name: string) =>
  checkPosting(description).technologies.find((tech) => tech.name === name);

describe("checkPosting", () => {
  it("lists each technology a posting asks for once, with evidence", () => {
    const { technologies } = checkPosting("Build on AWS with Python. AWS experience a plus.");
    expect(technologies.filter((tech) => tech.name === "AWS")).toHaveLength(1);
    expect(find("Build on AWS with Python.", "AWS")).toEqual({ name: "AWS", firm: true, evidence: false });
    expect(find("Build on AWS with Python.", "Python")).toMatchObject({ evidence: true });
  });

  it("marks a technology that only appears in an either-or language list as not firm", () => {
    expect(find("Experience in Java, Python, or Go.", "Go")).toMatchObject({ firm: false });
  });

  it("puts firm requirements before options", () => {
    const names = checkPosting("Experience in Java, Python, or Go. Deep AWS knowledge.").technologies;
    expect(names[0]).toMatchObject({ name: "AWS", firm: true });
    expect(names.at(-1)?.firm).toBe(false);
  });

  it("flags citizenship and clearance requirements", () => {
    expect(checkPosting("Must be a U.S. citizen. Python.").restricted).toBe(true);
    expect(checkPosting("Python.").restricted).toBe(false);
  });

  it("finds nothing in empty text", () => {
    expect(checkPosting("  ")).toEqual({ technologies: [], restricted: false });
  });
});
