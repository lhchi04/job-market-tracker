# AWS setup, deploy and teardown

Do these in order. Nothing costs money until step 4.

## 1. Create and secure the account (console)

1. Sign up at aws.amazon.com. New accounts choose a **Free plan** or a **Paid plan**.
   The Free plan cannot charge your card, but it ends after about 6 months or when the credits
   run out, and AWS then closes the account. Upgrade before then to keep the site live.
   Read the current terms on the signup page; they change.
2. Turn on **MFA for the root user**. Root can do anything, including close the account, so after
   this you only use it for billing.
3. Create a **budget** of $1 per month with an email alert (Billing and Cost Management > Budgets).
   Do this before creating any resources.
4. Open **IAM Identity Center** in `us-east-1`, enable it, create a user for yourself, and give it
   the `AdministratorAccess` permission set on this account. This replaces long-lived access keys:
   you sign in through a browser and get credentials that expire.

## 2. Connect the CLI

```sh
aws configure sso          # profile name: tracker, region: us-east-1
aws sso login --profile tracker
aws sts get-caller-identity --profile tracker   # prints your account, proving it works
```

## 3. Bootstrap CDK (once per account and region)

```sh
nvm use
npm ci
npx -w infra cdk bootstrap --profile tracker
```

Bootstrapping creates a small stack holding the S3 bucket and roles CDK deploys with.

## 4. Deploy

```sh
npm run build
npx -w infra cdk diff --profile tracker      # read what will change
npx -w infra cdk deploy --profile tracker
```

The output prints `SiteUrl` and `DataBucketName`.

## 5. Load the postings

```sh
aws s3 sync "$HOME/Desktop/job app/data/jobs" "s3://<DataBucketName>/postings/" \
  --exclude "raw/*" --delete --profile tracker
```

Wait about a minute: uploads queue up, then one Lambda run recomputes the counts. Then open `SiteUrl`.
If nothing appears, check the `Ingest` function's logs in CloudWatch.

## Teardown

```sh
npx -w infra cdk destroy --profile tracker
```

This deletes the stack, including both buckets and the table. Your postings stay on your machine.
To remove everything, also delete the `CDKToolkit` stack in the CloudFormation console and empty
its bucket first.

## How a request flows

- The browser loads the page from **CloudFront**, which reads a private **S3** bucket.
- `/api/*` goes through the same CloudFront domain to **API Gateway**, which runs the `Api` **Lambda**.
- That Lambda queries **DynamoDB** and returns the report.
- Uploading to the data bucket puts events on an **SQS** queue. The `Ingest` Lambda reads them in
  batches, recomputes everything from all postings and replaces the rows in DynamoDB.
- Runs that fail three times land in a dead-letter queue instead of being lost.
