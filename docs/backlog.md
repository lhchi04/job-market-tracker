# How work is planned

Work is tracked as GitHub issues on the [project board](https://github.com/users/lhchi04/projects/1).

## Sprints

Each sprint is one week and is a [milestone](https://github.com/lhchi04/job-market-tracker/milestones)
due on Sunday.

| Sprint | Dates | Goal |
|---|---|---|
| 1 | Nov 3–9 | Live end to end: deploy the stack and show real postings |
| 2 | Nov 10–16 | Production ready: alarm, measurements, docs, posting check |
| 3 | Nov 17–23 | MCP server: answer job-market questions through tools over the live API |
| 4 | Nov 24–30 | RAG: answer questions about the postings with citations |

At the start of a sprint, move its issues to **In Progress** one at a time. At the end, close what's
done and move anything unfinished to the next sprint.

Issues without a milestone are the backlog. Issues labeled `blocked` wait on something outside the
repo, such as an AWS account change.

## Definition of done

- The change is in a pull request that links its issue (`Closes #n`).
- CI passes: typecheck, tests and build.
- New logic has tests, written first where practical.
- I've reviewed my own diff before merging.
- Anything deployed is verified against the live site or API.
