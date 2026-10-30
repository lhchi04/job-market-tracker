import { TECHNOLOGIES, type Technology } from "./technologies";

export interface Posting {
  id: string;
  source: string;
  origin?: string;
  title: string;
  company: string;
  location: string;
  description: string;
  collected: string;
}

export interface TechnologyCount {
  name: string;
  firm: number;
  mentions: number;
  evidence: boolean;
}

export type PostingSummary = Omit<Posting, "description">;

export interface Report {
  summary: { analyzed: number; fromUrls: number; fromSearch: number; filtered: number; empty: number };
  technologies: TechnologyCount[];
  postings: PostingSummary[];
  filtered: Pick<Posting, "title" | "company">[];
}

const CITIZENSHIP =
  /(must be|requires?|required|only).{0,40}(u\.?s\.? citizen|citizenship)|security clearance|(secret|ts\/sci) clearance|clearance is required/i;

const LANGUAGES = ["python", "java", "c++", "c#", "javascript", "typescript", "go", "rust", "ruby", "kotlin", "swift", "php"];
const LANGUAGE_PATTERNS = LANGUAGES.map(
  (language) => new RegExp(String.raw`(?<![\w+#])${language.replace(/[+#]/g, "\\$&")}(?![\w+#])`),
);
const LIST_WORDS = /\bor\b|such as|e\.g\.|one of|any of|\blike\b/;
const SENTENCE = /[^\n.;]*(?:\.(?!\s)[^\n.;]*)*/g;

const isLanguageList = (sentence: string): boolean => {
  const words = sentence.toLowerCase();
  const named = LANGUAGE_PATTERNS.filter((pattern) => pattern.test(words)).length;
  return named >= 3 && LIST_WORDS.test(words);
};

/** True when every mention sits in an either-or list of languages, so another language meets it. */
const optionOnly = (pattern: RegExp, description: string): boolean => {
  const sentences = [...description.matchAll(SENTENCE)].map(([sentence]) => sentence).filter((s) => pattern.test(s));
  return sentences.length > 0 && sentences.every(isLanguageList);
};

const countTechnology = ({ name, pattern, evidence, caseSensitive }: Technology, descriptions: string[]): TechnologyCount => {
  const regex = new RegExp(pattern, caseSensitive ? "" : "i");
  const matching = descriptions.filter((description) => regex.test(description));
  const firm = matching.filter((description) => !optionOnly(regex, description)).length;
  return { name, firm, mentions: matching.length, evidence };
};

const byRank = (a: TechnologyCount, b: TechnologyCount): number =>
  b.firm - a.firm || b.mentions - a.mentions || (a.name < b.name ? -1 : 1);

/** Reposts share a company and title prefix; the first one seen wins. */
const unique = (postings: Posting[]): Posting[] => {
  const seen = new Map<string, Posting>();
  for (const posting of postings) {
    const key = `${posting.company.toLowerCase()}\0${posting.title.slice(0, 40).toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, posting);
  }
  return [...seen.values()];
};

export const analyze = (input: Posting[]): Report => {
  const postings = unique(input);
  const described = postings.filter((posting) => posting.description);
  const kept = described.filter((posting) => !CITIZENSHIP.test(posting.description));
  const filtered = described.filter((posting) => CITIZENSHIP.test(posting.description));
  const descriptions = kept.map((posting) => posting.description);
  const fromUrls = kept.filter((posting) => (posting.origin ?? "search") === "inbox").length;

  return {
    summary: {
      analyzed: kept.length,
      fromUrls,
      fromSearch: kept.filter((posting) => (posting.origin ?? "search") === "search").length,
      filtered: filtered.length,
      empty: postings.length - described.length,
    },
    technologies: TECHNOLOGIES.map((technology) => countTechnology(technology, descriptions))
      .filter((technology) => technology.mentions > 0)
      .sort(byRank),
    postings: kept.map(({ description: _, ...summary }) => summary),
    filtered: filtered.map(({ title, company }) => ({ title, company })),
  };
};
