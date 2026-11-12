# Job Market Tracker

Shows which technologies appear most in saved job postings, and which ones I don't have evidence for yet.

Built with React, TypeScript, AWS Lambda, API Gateway, DynamoDB, S3, SQS and AWS CDK, with the dashboard on GitHub Pages.

Live: https://lhchi04.github.io/job-market-tracker/

## Architecture

```mermaid
flowchart LR
  user([Browser]) -->|page| pages[GitHub Pages<br/>React dashboard]
  user -->|GET /api/report, CORS| apigw[API Gateway<br/>HTTP API, throttled]
  apigw --> api[Api Lambda<br/>read-only]
  api --> ddb[(DynamoDB<br/>on-demand)]

  me([Saved postings]) -->|aws s3 sync| s3[(S3 data bucket<br/>private)]
  s3 -->|object events| sqs[SQS Uploads<br/>60s batching]
  sqs --> ingest[Ingest Lambda<br/>recomputes all counts]
  ingest -->|reads| s3
  ingest -->|replaces rows| ddb
  sqs -->|after 3 failures| dlq[Dead-letter queue]
  dlq --> alarm[CloudWatch alarm] --> sns[SNS email]
```

GitHub Pages hosts the dashboard because this AWS account isn't approved for CloudFront yet.
Everything on the AWS side is defined in `packages/infra` with CDK and has no always-on resources.

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
