import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { TrackerStack, type TrackerStackProps } from "../lib/tracker-stack";

let template: Template;

const synth = (props: Partial<TrackerStackProps> = {}) =>
  Template.fromStack(new TrackerStack(new App(), "Test", { siteOrigin: "https://example.github.io", ...props }));

beforeAll(() => {
  template = synth({ alarmEmail: "me@example.com" });
}, 60_000);

describe("TrackerStack", () => {
  it("creates no always-on resources", () => {
    for (const type of ["AWS::EC2::NatGateway", "AWS::EC2::VPC", "AWS::RDS::DBInstance"]) {
      template.resourceCountIs(type, 0);
    }
    template.hasResourceProperties("AWS::DynamoDB::Table", { BillingMode: "PAY_PER_REQUEST" });
  });

  it("keeps every bucket private", () => {
    const buckets = Object.values(template.findResources("AWS::S3::Bucket"));
    expect(buckets.length).toBeGreaterThanOrEqual(1);
    for (const bucket of buckets) {
      expect(bucket.Properties.PublicAccessBlockConfiguration).toMatchObject({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      });
    }
  });

  it("uses no CloudFront, which this account can't access", () => {
    template.resourceCountIs("AWS::CloudFront::Distribution", 0);
  });

  it("lets only the dashboard's origin call the API", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: { AllowOrigins: ["https://example.github.io"], AllowMethods: ["GET"] },
    });
  });

  it("throttles the public API", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 },
    });
  });

  it("batches uploads and caps concurrent recomputes", () => {
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      BatchSize: 1000,
      MaximumBatchingWindowInSeconds: 60,
      ScalingConfig: { MaximumConcurrency: 2 },
    });
  });

  it("gives the API function read access only", () => {
    const policies = Object.entries(template.findResources("AWS::IAM::Policy")).filter(([id]) => id.startsWith("Api"));
    expect(JSON.stringify(policies)).toContain("dynamodb:Query");
    expect(JSON.stringify(policies)).not.toContain("dynamodb:PutItem");
    expect(JSON.stringify(policies)).not.toContain("dynamodb:BatchWriteItem");
  });

  it("alarms as soon as a run lands in the dead-letter queue", () => {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      MetricName: "ApproximateNumberOfMessagesVisible",
      Namespace: "AWS/SQS",
      Threshold: 1,
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
      AlarmActions: [{ Ref: Match.stringLikeRegexp("^Alerts") }],
    });
  });

  it("emails the alarm only when an address is given", () => {
    template.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: "me@example.com" });
    synth().resourceCountIs("AWS::SNS::Subscription", 0);
  }, 60_000);
});
