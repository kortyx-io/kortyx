#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { KortyxStudioStack } from "../lib/kortyx-studio-stack";

const app = new cdk.App();

new KortyxStudioStack(app, "KortyxStudio", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  vpcId: requiredContext("vpcId"),
  hostedZoneId: requiredContext("hostedZoneId"),
  hostedZoneName: requiredContext("hostedZoneName"),
  certificateArn: requiredContext("certificateArn"),
  studioDomainName: requiredContext("studioDomainName"),
  telemetryDomainName: requiredContext("telemetryDomainName"),
  allowedCidr: requiredContext("allowedCidr"),
  version: requiredContext("kortyxVersion"),
});

function requiredContext(name: string): string {
  const value: unknown = app.node.tryGetContext(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing CDK context value: ${name}`);
  }
  return value.trim();
}
