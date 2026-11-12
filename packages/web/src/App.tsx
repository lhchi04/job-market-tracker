import { checkPosting, type Report, type TechnologyCount } from "core";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

type View = "gaps" | "evidence" | "all";

const VIEWS: { id: View; label: string }[] = [
  { id: "gaps", label: "Gaps" },
  { id: "evidence", label: "Have evidence" },
  { id: "all", label: "All" },
];

const inView = (view: View) => (technology: TechnologyCount) =>
  view === "all" || technology.evidence === (view === "evidence");

// Set at build time to the deployed API Gateway URL. Empty means same origin, as in tests.
const API_URL = import.meta.env.VITE_API_URL ?? "";

const fetchReport = async (signal: AbortSignal): Promise<Report> => {
  const response = await fetch(`${API_URL}/api/report`, { signal });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
};

const Table = ({ technologies, analyzed }: { technologies: TechnologyCount[]; analyzed: number }) => {
  const scale = Math.max(...technologies.map(({ firm }) => firm), 1);
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Technology</th>
          <th scope="col" className="bar-column">Firm mentions</th>
          <th scope="col" className="number">Firm</th>
          <th scope="col" className="number">All</th>
          <th scope="col" className="number share">Share</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {technologies.map(({ name, firm, mentions, evidence }) => (
          <tr key={name}>
            <th scope="row">{name}</th>
            <td className="bar-column">
              <div className="bar" style={{ width: `${(firm / scale) * 100}%` }} />
            </td>
            <td className="number">{firm}</td>
            <td className="number">{mentions}</td>
            <td className="number share">{Math.round((firm / analyzed) * 100)}%</td>
            <td className="status">{evidence ? "Evidence" : "Gap"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Runs entirely in the browser: a pasted posting never leaves the page.
const PostingCheck = () => {
  const [text, setText] = useState("");
  const deferred = useDeferredValue(text);
  const { technologies, restricted } = useMemo(() => checkPosting(deferred), [deferred]);
  const firm = technologies.filter((technology) => technology.firm);
  const covered = firm.filter((technology) => technology.evidence).length;

  return (
    <section className="check" aria-labelledby="check-heading">
      <h2 id="check-heading">Check a posting</h2>
      <p className="lede">Paste a job description to see which technologies it asks for, and which I have evidence for.</p>
      <label htmlFor="posting">Job description</label>
      <textarea id="posting" rows={6} value={text} onChange={(event) => setText(event.target.value)} />
      {technologies.length > 0 && (
        <div role="region" aria-label="Posting check">
          <p>
            {firm.length > 0
              ? `I have evidence for ${covered} of ${firm.length} firm requirements.`
              : "It only names technologies as options in a list."}
            {restricted && " It also mentions a citizenship or clearance requirement."}
          </p>
          <ul className="matches">
            {technologies.map(({ name, firm, evidence }) => (
              <li key={name} className={evidence ? "evidence" : "gap"}>
                <span>{name}</span>
                <span className="status">
                  {evidence ? "Evidence" : "Gap"}
                  {!firm && ", one option"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

const Dashboard = ({ report }: { report: Report }) => {
  const [view, setView] = useState<View>("gaps");
  const { summary, technologies } = report;
  const shown = technologies.filter(inView(view));
  return (
    <>
      <p className="lede">
        {summary.analyzed} postings analyzed, {summary.filtered} removed for citizenship or clearance. A firm mention
        means the technology wasn't just one option in an either-or language list.
      </p>
      <div className="views" role="group" aria-label="Filter technologies">
        {VIEWS.map(({ id, label }) => (
          <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>
      {shown.length > 0 ? <Table technologies={shown} analyzed={summary.analyzed} /> : <p>No technologies here yet.</p>}
    </>
  );
};

export const App = () => {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    fetchReport(controller.signal)
      .then(setReport)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <h1>Job Market Tracker</h1>
      {error ? (
        <p role="alert">Could not load the report: {error}</p>
      ) : report ? (
        <Dashboard report={report} />
      ) : (
        <p>Loading…</p>
      )}
      <PostingCheck />
    </main>
  );
};
