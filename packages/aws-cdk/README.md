# `@kortyx/aws-cdk`

Deploy a private Kortyx Studio installation on ECS Fargate with PostgreSQL on RDS, HTTPS on an internal Application Load Balancer, Route 53 DNS, and generated Secrets Manager credentials.

This is the maintained, batteries-included CDK path. It is not required at runtime: the same Kortyx containers can be deployed with Terraform, Pulumi, CloudFormation, lower-level CDK, EKS, or Docker Compose.

```bash
pnpm add @kortyx/aws-cdk aws-cdk-lib constructs
```

```ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { KortyxStudio } from "@kortyx/aws-cdk";
import { Construct } from "constructs";

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: "vpc-0123456789abcdef0",
    });

    new KortyxStudio(this, "Studio", {
      vpc,
      domainName: "studio.example.com",
      version: "v0.4.0",
    });
  }
}
```

The default is private: the ALB accepts HTTPS from the VPC CIDR, tasks and RDS have no public IP, and credentials are generated in Secrets Manager. The construct infers the `example.com` hosted zone from `studio.example.com` and creates a DNS-validated certificate. Pass `hostedZone` or `certificate` when the inferred defaults do not match your DNS layout.

The same URL serves Studio and telemetry. Requests to `/v1/telemetry/*` and `/health` route to the API; all other requests route to Studio.

The construct intentionally deploys one cohesive ECS task. The Kortyx runtime supports multiple replicas, but this convenience package does not model independently scaled services or an external migration job. Use the portable deployment contract for a custom highly available ECS or EKS topology; do not deploy two copies of this construct against one database.

See the full [AWS CDK deployment guide](https://kortyx.io/docs/studio/deploy-aws-cdk) for prerequisites, credentials, upgrades, and the current availability model.
