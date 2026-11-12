# Job Market Tracker

Shows which technologies appear most in saved job postings, and which ones I don't have evidence for yet.

Built with React, TypeScript, AWS Lambda, API Gateway, DynamoDB, S3, SQS and AWS CDK, with the dashboard on GitHub Pages.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Technology matching and counting |
| `packages/functions` | The API and ingestion Lambdas |
| `packages/web` | React dashboard |
| `packages/infra` | CDK stack |

## Develop

```sh
nvm use
npm ci
npm test
npm run typecheck
```

`npx tsx scripts/report.ts <dir>` prints the analysis for a local folder of postings.

Real postings are not in this repo. Tests use synthetic text. See [docs/aws-setup.md](docs/aws-setup.md) to deploy.
