import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { CfnStage, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AllowedMethods, CachePolicy, Distribution, OriginRequestPolicy, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin, S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction, type NodejsFunctionProps } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { BlockPublicAccess, Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { SqsDestination } from "aws-cdk-lib/aws-s3-notifications";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import { fileURLToPath } from "node:url";

const entry = (name: string) => fileURLToPath(new URL(`../../functions/src/${name}.ts`, import.meta.url));

export interface TrackerStackProps extends StackProps {
  siteDir: string;
}

export class TrackerStack extends Stack {
  constructor(scope: Construct, id: string, { siteDir, ...props }: TrackerStackProps) {
    super(scope, id, props);

    // Everything here is safe to destroy: the postings live on your machine and rebuild the rest.
    const disposable = { removalPolicy: RemovalPolicy.DESTROY };
    const privateBucket = {
      ...disposable,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    };

    const table = new Table(this, "Table", {
      ...disposable,
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    const dataBucket = new Bucket(this, "Data", privateBucket);

    const lambda = (name: string, overrides: Partial<NodejsFunctionProps>) =>
      new NodejsFunction(this, name, {
        entry: entry(name.toLowerCase()),
        runtime: Runtime.NODEJS_24_X,
        memorySize: 256,
        logGroup: new LogGroup(this, `${name}Logs`, { ...disposable, retention: RetentionDays.TWO_WEEKS }),
        ...overrides,
      });

    const api = lambda("Api", { environment: { TABLE_NAME: table.tableName } });
    table.grantReadData(api);

    const ingest = lambda("Ingest", {
      timeout: Duration.minutes(2),
      environment: { TABLE_NAME: table.tableName, BUCKET_NAME: dataBucket.bucketName },
    });
    table.grantReadWriteData(ingest);
    dataBucket.grantRead(ingest);

    // A bulk upload fires one event per file. The queue folds those into a single recompute.
    const deadLetters = new Queue(this, "IngestDeadLetters", { retentionPeriod: Duration.days(14) });
    const uploads = new Queue(this, "Uploads", {
      visibilityTimeout: Duration.minutes(12),
      deadLetterQueue: { queue: deadLetters, maxReceiveCount: 3 },
    });
    dataBucket.addEventNotification(EventType.OBJECT_CREATED, new SqsDestination(uploads), { prefix: "postings/" });
    dataBucket.addEventNotification(EventType.OBJECT_REMOVED, new SqsDestination(uploads), { prefix: "postings/" });
    ingest.addEventSource(
      new SqsEventSource(uploads, { batchSize: 1000, maxBatchingWindow: Duration.seconds(60), maxConcurrency: 2 }),
    );

    const httpApi = new HttpApi(this, "HttpApi", { createDefaultStage: true });
    httpApi.addRoutes({
      path: "/api/report",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("ApiIntegration", api),
    });
    // The API is public, so a low ceiling keeps a traffic spike from becoming a bill.
    (httpApi.defaultStage!.node.defaultChild as CfnStage).defaultRouteSettings = {
      throttlingBurstLimit: 20,
      throttlingRateLimit: 10,
    };

    const siteBucket = new Bucket(this, "Site", privateBucket);
    const distribution = new Distribution(this, "Cdn", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        // Same origin as the page, so the frontend needs no API URL and no CORS.
        "/api/*": {
          origin: new HttpOrigin(`${httpApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`),
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    new BucketDeployment(this, "DeploySite", {
      sources: [Source.asset(siteDir)],
      destinationBucket: siteBucket,
      distribution,
    });

    new CfnOutput(this, "SiteUrl", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "DataBucketName", { value: dataBucket.bucketName });
  }
}
