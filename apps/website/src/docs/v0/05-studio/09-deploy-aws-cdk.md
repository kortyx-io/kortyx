---
id: v0-studio-deploy-aws-cdk
title: "Deploy Kortyx Studio on AWS with CDK"
description: "Deploy Kortyx Studio privately on ECS Fargate with RDS, Secrets Manager, an internal load balancer, and the Kortyx AWS CDK construct."
keywords: [kortyx, studio, aws, cdk, ecs, fargate, rds, self-hosted]
sidebar_label: "Deploy on AWS with CDK"
---
# Deploy Kortyx Studio on AWS with CDK

`@kortyx/aws-cdk` deploys a private Kortyx Studio installation in an existing VPC:

```ts
new KortyxStudio(this, "Studio", {
  vpc,
  domainName: "studio.example.com",
  version: "v0.3.2",
});
```

The construct creates ECS Fargate, PostgreSQL on RDS, generated credentials in Secrets Manager, an internal HTTPS load balancer, and Route 53 DNS. Studio and telemetry share one hostname.

> **Private by default:** The load balancer accepts traffic from the VPC CIDR, and neither the ECS task nor RDS receives a public IP. Reach it from the VPC, a peered network, or a VPN.

## Choose a deployment path

This construct is the maintained, batteries-included AWS path, not a requirement for running Kortyx on AWS. Use it when your infrastructure is managed with CDK and its defaults fit your environment.

Kortyx also publishes ordinary container images and a stable [deployment contract](./08-configuration-reference.md). You can implement that contract with:

- your own ECS service using Terraform, Pulumi, CloudFormation, or lower-level CDK;
- EKS or another Kubernetes platform;
- Docker Compose on EC2; or
- an existing database, cluster, certificate, and DNS design.

The CDK package is an infrastructure dependency; the deployed Kortyx workload does not require it at runtime. If your organization already standardizes on another infrastructure tool, keep that tool and use the same containers and environment variables. See [Deploy on a Server](./06-deploy-server.md) for the portable container path.

## Architecture

```text
VPC or VPN client
       |
       | HTTPS :443
       v
studio.example.com (internal ALB)
       |-- /v1/telemetry/*, /health -> API :6400
       `-- everything else          -> Studio :6300
                                             |
                                             v
                                    private RDS PostgreSQL
```

The Fargate task starts in this order:

```text
database migration + bootstrap -> healthy telemetry API -> Studio
```

A failed migration or bootstrap prevents that task from serving traffic.

## Before you start

You need:

- an AWS account and AWS CLI credentials with permission to deploy CDK stacks;
- Node.js 22 or newer;
- an existing VPC with private subnets in at least two Availability Zones;
- outbound HTTPS from those subnets, through NAT or equivalent egress, so Fargate can pull the public GHCR images; and
- a public Route 53 hosted zone for the parent domain.

The minimal example infers `example.com` from `studio.example.com` and creates a DNS-validated ACM certificate. Pass an explicit `hostedZone` or `certificate` when your DNS layout differs.

This deployment creates billable ECS, RDS, Application Load Balancer, Secrets Manager, CloudWatch Logs, and networking resources. Review `cdk diff` and your expected AWS cost before deployment.

## 1. Create a CDK application

```bash
mkdir kortyx-studio-infra
cd kortyx-studio-infra
npx aws-cdk@latest init app --language typescript
npm install @kortyx/aws-cdk aws-cdk-lib constructs
```

AWS requires each account and Region to be [bootstrapped for CDK](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html) once.

## 2. Add Kortyx Studio

Replace `lib/kortyx-studio-infra-stack.ts` with:

```ts file="lib/kortyx-studio-infra-stack.ts"
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { KortyxStudio } from "@kortyx/aws-cdk";

export class KortyxStudioInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", {
      vpcId: "vpc-0123456789abcdef0",
    });

    new KortyxStudio(this, "Studio", {
      vpc,
      domainName: "studio.example.com",
      version: "v0.3.2",
    });
  }
}
```

Use an immutable published version. `latest` and incomplete versions are rejected so a deployment can be reproduced and rolled back intentionally.

If `studio.example.com` is not directly beneath the hosted zone, pass it explicitly:

```ts
import * as route53 from "aws-cdk-lib/aws-route53";

const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
  domainName: "internal.example.com",
});

new KortyxStudio(this, "Studio", {
  vpc,
  hostedZone,
  domainName: "studio.internal.example.com",
  version: "v0.3.2",
});
```

## 3. Review the defaults

| Resource | Default |
| --- | --- |
| ECS | One Fargate task with database-init, API, and Studio containers |
| RDS | PostgreSQL 17, `db.t4g.micro`, 20 GiB with storage autoscaling |
| Secrets | Generated database password, key pepper, Project keys, and Basic Auth password |
| Load balancer | Internal ALB; one hostname with path-based routing |
| Networking | ALB ingress from the VPC CIDR; no task or database public IP |
| Recovery | Seven-day database backups, retained secrets and logs, database deletion protection |

Common overrides remain concise:

```ts
new KortyxStudio(this, "Studio", {
  vpc,
  domainName: "studio.example.com",
  version: "v0.3.2",
  allowedCidrs: [vpc.vpcCidrBlock, "10.50.0.0/16"],
  databaseMultiAz: true,
  databaseInstanceType: ec2.InstanceType.of(
    ec2.InstanceClass.T4G,
    ec2.InstanceSize.SMALL,
  ),
});
```

You can also supply an existing `cluster`, `hostedZone`, `certificate`, or `database`. The TypeScript API documents the required shape for each value.

## Availability: what one application task means

Kortyx currently runs one active ECS task. This is an **availability boundary, not a data-durability boundary**:

- telemetry, projects, and Studio state live in PostgreSQL, not in the task;
- if the task crashes, ECS starts a replacement against the same database;
- RDS backups, deletion protection, and an optional Multi-AZ standby protect the database; but
- Studio and telemetry are briefly unavailable while the replacement initializes, and planned version updates also have a short interruption.

The construct does not expose `desiredCount: 2` yet because every new task runs schema migration and bootstrap before it starts. Kortyx has not yet guaranteed concurrent initializers or backwards-compatible rolling migrations between adjacent releases. Starting two replicas would look highly available while leaving upgrade races undefined.

True multi-replica support requires serialized migrations, expand-and-contract schema compatibility, rolling-deployment tests, and then at least two tasks with health-preserving ECS deployment settings. Until that contract ships, one task is the honest supported topology. For stronger database availability today, enable `databaseMultiAz`; it does not remove the application restart window.

## 4. Bootstrap, inspect, and deploy

Confirm the AWS identity and Region:

```bash
aws sts get-caller-identity
aws configure get region
```

Then bootstrap, compile, inspect, and deploy:

```bash
npx cdk bootstrap
npm run build
npx cdk synth
npx cdk diff
npx cdk deploy
```

Commit the CDK source to your infrastructure repository. For shared environments, deploy through your reviewed CI/CD workflow.

The deployment is ready when the ECS service has one running task and both target groups report it healthy.

## 5. Retrieve the initial credentials

The construct outputs the Studio URL and generated secret names. Retrieve the browser password without placing it in source control:

```bash
studio_password_secret="$(aws cloudformation describe-stacks \
  --stack-name KortyxStudioInfraStack \
  --query "Stacks[0].Outputs[?contains(OutputKey, 'StudioPasswordSecretName')].OutputValue" \
  --output text)"

aws secretsmanager get-secret-value \
  --secret-id "$studio_password_secret" \
  --query SecretString \
  --output text
```

Open the `StudioUrl` output and sign in as `admin` with that password.

Build the telemetry write key from its generated secret suffix:

```bash
telemetry_secret_name="$(aws cloudformation describe-stacks \
  --stack-name KortyxStudioInfraStack \
  --query "Stacks[0].Outputs[?contains(OutputKey, 'TelemetryKeySecretName')].OutputValue" \
  --output text)"
telemetry_secret="$(aws secretsmanager get-secret-value \
  --secret-id "$telemetry_secret_name" \
  --query SecretString \
  --output text)"

printf 'ktyx_live_default-telemetry_%s\n' "$telemetry_secret"
unset telemetry_secret
```

Treat both outputs as secrets. Do not paste them into build logs, tickets, or screenshots.

## 6. Connect and verify

Give each application's server runtime:

```bash file="server environment"
KORTYX_TELEMETRY_API_URL=https://studio.example.com
KORTYX_TELEMETRY_API_KEY=ktyx_live_default-telemetry_...
KORTYX_TELEMETRY_ENVIRONMENT=production
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

The application must have a network route to the internal load balancer. Never put the telemetry key in a browser bundle. Continue with [Connect Your Project](./03-connect-project.md) to publish workflow topology.

From an allowed VPC or VPN client:

```bash
curl --fail https://studio.example.com/health
curl --head https://studio.example.com
```

The API health request should return `200`. Studio may return `401` before browser credentials are provided; that confirms Basic Auth is active.

If a target remains unhealthy, inspect the task's `database-init`, `api`, and `studio` CloudWatch log streams in that order. Common causes are missing subnet egress to GHCR, DNS or certificate validation, a CIDR that does not match the caller's observed address, or database connectivity blocked by a security group.

## Upgrade with CDK

ECS deployments are controlled by CDK, not by the local Docker updater shown in Studio.

1. Back up the RDS database and deployment secrets.
2. Change `version` to the next immutable Studio release.
3. Run `npm run build`, `npx cdk synth`, and `npx cdk diff`.
4. Deploy through the same reviewed path.
5. Wait for database initialization and both target groups to become healthy.

The ECS deployment circuit breaker can roll back a task definition when a replacement fails; it cannot roll back a database schema. Database downgrade is unsupported, so restore the matching pre-upgrade snapshot if a newer migration is incompatible with the previous release.

> **Expected Studio message:** "This installation does not have an in-product updater. Manage updates through your deployment workflow, or use the Kortyx installer for local Docker update management." This is normal for an orchestrated installation: the workflow might be CDK/ECS on AWS, Terraform or Cloud Deploy on Google Cloud, or Helm/GitOps on Kubernetes.

For backups, credential handling, and failure recovery, continue with [Operations and Troubleshooting](./07-operations.md) and the [Configuration Reference](./08-configuration-reference.md).
