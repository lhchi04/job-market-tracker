import type { Report, TechnologyCount } from "core";
import { useEffect, useState } from "react";

type View = "gaps" | "evidence" | "all";

const VIEWS: { id: View; label: string }[] = [
  { id: "gaps", label: "Gaps" },
  { id: "evidence", label: "Have evidence" },
  { id: "all", label: "All" },
];

const inView = (view: View) => (technology: TechnologyCount) =>
  view === "all" || technology.evidence === (view === "evidence");

const fetchReport = async (signal: AbortSignal): Promise<Report> => {
  const response = await fetch("/api/report", { signal });
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

export const App = () => {
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<View>("gaps");

  useEffect(() => {
    const controller = new AbortController();
    fetchReport(controller.signal)
      .then(setReport)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  if (error) return <main><p role="alert">Could not load the report: {error}</p></main>;
  if (!report) return <main><p>Loading…</p></main>;

  const { summary, technologies } = report;
  const shown = technologies.filter(inView(view));
  return (
    <main>
      <h1>Job Market Tracker</h1>
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
    </main>
  );
};
