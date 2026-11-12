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
4. Open **IAM > Users > Create user**, allow console access, and attach the `AdministratorAccess`
   policy directly. Then turn on MFA for that user and sign in as them from now on. Skip IAM Identity
   Center: its account access needs AWS Organizations, and joining that moves a Free plan account to
   the Paid plan. Do not create access keys: `aws login` gives you credentials that expire.

## 2. Connect the CLI

```sh
aws login --profile tracker     # region: us-east-2, then sign in as the IAM user in the browser
aws sts get-caller-identity --profile tracker   # prints your account, proving it works
```

Sessions last up to 12 hours. Run `aws login --profile tracker` again when they expire.

## 3. Bootstrap CDK (once per account and region)

```sh
nvm use
npm ci
npx -w infra cdk bootstrap --profile tracker
```

Bootstrapping creates a small stack holding the S3 bucket and roles CDK deploys with.

## 4. Deploy

```sh
npx -w infra cdk diff --profile tracker      # read what will change
npx -w infra cdk deploy --profile tracker
```

The output prints `ApiUrl` and `DataBucketName`.

The dashboard is not on AWS. AWS hasn't approved CloudFront for this account yet, so GitHub Pages
hosts the page and calls the API directly. One-time setup:

1. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions → Variables**, add `API_URL` set to `ApiUrl`.
3. Run the **Deploy dashboard** workflow, or merge to `main`. The site is at
   `https://lhchi04.github.io/job-market-tracker/`.

If the site lives elsewhere, deploy with `SITE_ORIGIN=https://<host>` so the API's CORS allows it.

On a new account the deploy can fail with "Your account must be verified before you can add new
CloudFront resources". Open a free **Account and billing** case in AWS Support, paste the error
with its request ID, and deploy again once they confirm. The failed stack rolls back on its own.

## 5. Load the postings

```sh
aws s3 sync "$HOME/Desktop/job app/data/jobs" "s3://<DataBucketName>/postings/" \
  --exclude "raw/*" --delete --profile tracker
```

Wait about a minute: uploads queue up, then one Lambda run recomputes the counts. Then open the dashboard.
If nothing appears, check the `Ingest` function's logs in CloudWatch.

## Teardown

```sh
npx -w infra cdk destroy --profile tracker
```

This deletes the stack, including both buckets and the table. Your postings stay on your machine.
To remove everything, also delete the `CDKToolkit` stack in the CloudFormation console and empty
its bucket first.

## How a request flows

- The browser loads the page from **GitHub Pages**.
- The page calls `/api/report` on **API Gateway**, which runs the `Api` **Lambda**. CORS allows only
  the dashboard's origin.
- That Lambda queries **DynamoDB** and returns the report.
- Uploading to the data bucket puts events on an **SQS** queue. The `Ingest` Lambda reads them in
  batches, recomputes everything from all postings and replaces the rows in DynamoDB.
- Runs that fail three times land in a dead-letter queue instead of being lost.
