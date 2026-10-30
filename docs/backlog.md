# Backlog

Create these as GitHub issues on a Project board. Work one sprint per week. Every change goes through
a pull request that CI must pass, and you review your own diff before merging.

## Sprint 1: live end to end

- [ ] Create and secure the AWS account (`docs/aws-setup.md`, steps 1-2)
- [ ] Bootstrap CDK and deploy the stack
- [ ] Load postings and confirm the live site shows them
- [ ] Confirm the live counts match `npx tsx scripts/report.ts <dir>`

## Sprint 2: production ready

- [ ] Add a CloudWatch alarm on the dead-letter queue, with email through SNS
- [ ] Add an IAM OIDC role for GitHub Actions, scoped to this repo
- [ ] Add a deploy job that runs on merge to `main`
- [ ] Add an architecture diagram to the README
- [ ] Measure real results: load time, ingest duration, monthly cost, test count
- [ ] Draft resume bullets from those measurements
