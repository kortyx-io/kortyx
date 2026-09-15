import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { describe, expect, it } from "vitest";
import { KortyxStudio } from "../src";

function createStack() {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {
    env: { account: "123456789012", region: "eu-west-1" },
  });
  const vpc = new ec2.Vpc(stack, "Vpc", { maxAzs: 2, natGateways: 1 });
  const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
    stack,
    "Zone",
    { hostedZoneId: "Z0123456789EXAMPLE", zoneName: "example.com" },
  );
  const certificate = acm.Certificate.fromCertificateArn(
    stack,
    "Certificate",
    "arn:aws:acm:eu-west-1:123456789012:certificate/00000000-0000-0000-0000-000000000000",
  );
  return { app, stack, vpc, hostedZone, certificate };
}

describe("KortyxStudio", () => {
  it("creates a private Studio deployment with one hostname", () => {
    const { stack, vpc, hostedZone, certificate } = createStack();

    const studio = new KortyxStudio(stack, "Studio", {
      vpc,
      hostedZone,
      certificate,
      domainName: "studio.example.com",
      version: "v0.3.2",
    });
    const template = Template.fromStack(stack);

    expect(studio.studioUrl).toBe("https://studio.example.com");
    expect(studio.telemetryApiUrl).toBe(studio.studioUrl);
    template.resourceCountIs("AWS::RDS::DBInstance", 1);
    template.hasResourceProperties(
      "AWS::ElasticLoadBalancingV2::LoadBalancer",
      {
        Scheme: "internal",
        Type: "application",
      },
    );
    template.hasResourceProperties("AWS::ECS::Service", {
      DesiredCount: 1,
      DeploymentConfiguration: Match.objectLike({
        MaximumPercent: 100,
        MinimumHealthyPercent: 0,
      }),
      NetworkConfiguration: {
        AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "DISABLED" }),
      },
    });
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({ Name: "kortyx-database-init", Essential: false }),
        Match.objectLike({
          Name: "kortyx-api",
          Image: "ghcr.io/kortyx-io/kortyx-api:v0.3.2",
        }),
        Match.objectLike({
          Name: "kortyx-studio",
          Image: "ghcr.io/kortyx-io/kortyx-studio:v0.3.2",
        }),
      ]),
    });
    template.hasResourceProperties(
      "AWS::ElasticLoadBalancingV2::ListenerRule",
      {
        Conditions: Match.arrayWith([
          Match.objectLike({
            Field: "path-pattern",
            PathPatternConfig: {
              Values: ["/v1/telemetry/*", "/health"],
            },
          }),
        ]),
      },
    );
    template.hasResourceProperties("AWS::Route53::RecordSet", {
      Name: "studio.example.com.",
      Type: "A",
    });
  });

  it("accepts an existing database and deployment overrides", () => {
    const { stack, vpc, hostedZone, certificate } = createStack();
    const credentialsSecret = new secretsmanager.Secret(stack, "Credentials", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "app_user" }),
        generateStringKey: "password",
      },
    });
    const database = new rds.DatabaseInstance(stack, "ExistingDatabase", {
      vpc,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      credentials: rds.Credentials.fromSecret(credentialsSecret),
      databaseName: "observability",
      storageEncrypted: true,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
    });

    new KortyxStudio(stack, "Studio", {
      vpc,
      hostedZone,
      certificate,
      domainName: "OBSERVABILITY.EXAMPLE.COM.",
      version: "v0.3.2-rc.1",
      allowedCidrs: ["10.20.0.0/16", "10.30.0.0/16"],
      basicAuthUsername: "operator",
      database: {
        instance: database,
        credentialsSecret,
        username: "app_user",
        databaseName: "observability",
      },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs("AWS::RDS::DBInstance", 1);
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: "kortyx-api",
          Environment: Match.arrayWith([
            { Name: "KORTYX_DB_USER", Value: "app_user" },
            { Name: "KORTYX_DB_NAME", Value: "observability" },
          ]),
        }),
        Match.objectLike({
          Name: "kortyx-studio",
          Environment: Match.arrayWith([
            { Name: "KORTYX_STUDIO_BASIC_AUTH_USERNAME", Value: "operator" },
          ]),
        }),
      ]),
    });
    template.hasResourceProperties("AWS::EC2::SecurityGroup", {
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({
          CidrIp: "10.20.0.0/16",
          FromPort: 443,
          ToPort: 443,
        }),
        Match.objectLike({
          CidrIp: "10.30.0.0/16",
          FromPort: 443,
          ToPort: 443,
        }),
      ]),
    });
  });

  it.each([
    "latest",
    "0.3.2",
    "v0.3",
    "vnext",
  ])("rejects mutable or malformed version %s", (version) => {
    const { stack, vpc, hostedZone, certificate } = createStack();

    expect(
      () =>
        new KortyxStudio(stack, "Studio", {
          vpc,
          hostedZone,
          certificate,
          domainName: "studio.example.com",
          version,
        }),
    ).toThrow("version must be an immutable Kortyx release tag");
  });

  it.each([
    "localhost",
    "-studio.example.com",
    "studio..example.com",
  ])("rejects invalid domain %s", (domainName) => {
    const { stack, vpc, hostedZone, certificate } = createStack();

    expect(
      () =>
        new KortyxStudio(stack, "Studio", {
          vpc,
          hostedZone,
          certificate,
          domainName,
          version: "v0.3.2",
        }),
    ).toThrow("domainName must be a fully qualified hostname");
  });
});
