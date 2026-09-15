import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as route53 from "aws-cdk-lib/aws-route53";
import { describe, it } from "vitest";
import { KortyxStudio } from "../src";

describe("KortyxStudio health contract", () => {
  it("restarts on liveness and routes only database-ready API tasks", () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "HealthContractStack", {
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

    new KortyxStudio(stack, "Studio", {
      vpc,
      hostedZone,
      certificate,
      domainName: "studio.example.com",
      version: "v0.4.0",
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: "kortyx-api",
          HealthCheck: Match.objectLike({
            Command: Match.arrayWith([Match.stringLikeRegexp("/live")]),
          }),
        }),
      ]),
    });
    template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
      HealthCheckPath: "/ready",
      Matcher: { HttpCode: "200" },
      Port: 6400,
    });
  });
});
