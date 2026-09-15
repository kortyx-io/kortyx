---
id: v0-studio-deploy-aws-cdk
title: "Deploy Kortyx Studio on AWS with CDK"
description: "Deploy Kortyx Studio privately on ECS Fargate with RDS, Secrets Manager, an internal load balancer, and AWS CDK."
keywords: [kortyx, studio, aws, cdk, ecs, fargate, rds, self-hosted]
sidebar_label: "Deploy on AWS with CDK"
---
# Deploy Kortyx Studio on AWS with CDK

This guide deploys a production-shaped, single-replica Kortyx Studio installation into an existing AWS VPC. It uses a copyable AWS CDK v2 example instead of asking you to translate the container contract yourself.

By the end, you will have:

1. Studio and the telemetry API running together as an ECS Fargate service;
2. PostgreSQL 17 on Amazon RDS;
3. generated credentials in AWS Secrets Manager;
4. an internal Application Load Balancer with HTTPS; and
5. Route 53 names for the private Studio and telemetry endpoints.

The database bootstrap container runs before the API, and Studio waits for the API health check. A failed bootstrap prevents the new task from serving traffic.

> **Private by default:** The example creates an internal load balancer and does not assign public IPs to ECS tasks or RDS. Reach it from the VPC, a peered network, or a VPN.

## Architecture

```text
VPC or VPN client
       |
       | HTTPS :443
       v
internal Application Load Balancer
       |-- studio.example.com    -> Studio :6300
       `-- telemetry.example.com -> API :6400
                                             |
                                             v
                                    private RDS PostgreSQL
```

The Fargate task starts in this order:

```text
database migration + bootstrap -> healthy telemetry API -> Studio
```

Studio is the human interface. Applications send telemetry to the API hostname with a Project-scoped write key.

## Before you start

You need:

- an AWS account and AWS CLI credentials with permission to deploy CDK stacks;
- Node.js 22 or newer;
- an existing VPC with private subnets in at least two Availability Zones;
- outbound HTTPS from those private subnets, through NAT or equivalent egress, so Fargate can pull the public GHCR images;
- a Route 53 hosted zone for the two hostnames; and
- an ACM certificate in the deployment Region that covers both hostnames.

This example creates billable ECS, RDS, Application Load Balancer, Secrets Manager, CloudWatch Logs, and networking resources. Review the generated CloudFormation template and expected AWS cost before deployment.

## 1. Create a CDK application

Start with a clean TypeScript CDK v2 project:

```bash
mkdir kortyx-studio-infra
cd kortyx-studio-infra
npx aws-cdk@latest init app --language typescript
```

AWS requires each account and Region to be [bootstrapped for CDK](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html) once. You will run that command after configuring the stack.

## 2. Copy the Kortyx CDK example

Choose an immutable Kortyx Studio version. The repository release tag is prefixed with `studio-`; the two container images use the version itself:

```bash
kortyx_version=vX.Y.Z
example_base="https://raw.githubusercontent.com/kortyx-io/kortyx/studio-${kortyx_version}/deploy/studio/aws-cdk"

curl --fail --location "${example_base}/lib/kortyx-studio-stack.ts" \
  --output lib/kortyx-studio-stack.ts
curl --fail --location "${example_base}/bin/kortyx-studio.ts" \
  --output bin/kortyx-studio.ts
```

Replace the generated `app` value in `cdk.json` so the CDK CLI runs the copied entry point:

```json file="cdk.json"
{
  "app": "npx ts-node --prefer-ts-exts bin/kortyx-studio.ts"
}
```

The example deliberately lives in your infrastructure repository after copying. Review and adapt it like any other application stack.

## 3. Configure non-secret deployment values

Add the following values to `cdk.context.json`:

```json file="cdk.context.json"
{
  "vpcId": "vpc-0123456789abcdef0",
  "hostedZoneId": "Z0123456789EXAMPLE",
  "hostedZoneName": "example.com",
  "certificateArn": "arn:aws:acm:eu-west-1:123456789012:certificate/00000000-0000-0000-0000-000000000000",
  "studioDomainName": "studio.example.com",
  "telemetryDomainName": "telemetry.example.com",
  "allowedCidr": "10.0.0.0/16",
  "kortyxVersion": "vX.Y.Z"
}
```

These values select AWS resources and names; they are not application secrets. The stack generates database credentials, the API-key pepper, Project keys, and the browser password directly in Secrets Manager.

Use a CIDR that can actually reach the internal load balancer:

- use the VPC CIDR for applications and users already in the VPC;
- use the routed client CIDR when your VPN preserves client addresses; or
- adapt the security-group rule when your VPN or network appliance translates source addresses.

Do not change the load balancer to internet-facing without adding a deliberate edge-access design. Basic Auth must only be used over HTTPS.

## 4. Review the generated infrastructure

The example creates the following resources:

| Resource | Default |
| --- | --- |
| ECS | One Fargate task with database-init, API, and Studio containers |
| RDS | PostgreSQL 17, `db.t4g.micro`, 20 GiB with storage autoscaling |
| Secrets | Generated database password, key pepper, two key secrets, and Basic Auth password |
| Load balancer | Internal ALB with one HTTPS listener and hostname-based routing |
| Networking | No task public IP; ALB ingress limited to `allowedCidr`; RDS accepts only the task security group |
| Recovery | Seven-day database backups, retained secrets and logs, database deletion protection |

The example is intentionally a single-replica deployment because that is Kortyx Studio's current supported remote topology. It sets ECS deployment percentages to stop the old task before starting the replacement, avoiding overlapping application versions during database migrations. Expect brief downtime during an upgrade.

Before deploying, decide whether to change:

- RDS instance size, storage, backups, or Multi-AZ;
- log retention;
- secret names and your organization's KMS keys;
- the Basic Auth username;
- the allowed CIDR or load-balancer topology; and
- alarms, tags, and cost-allocation metadata required by your organization.

## 5. Bootstrap, synthesize, and deploy

Confirm the AWS identity and Region before creating resources:

```bash
aws sts get-caller-identity
aws configure get region
```

Then bootstrap the environment, compile the example, inspect the change, and deploy:

```bash
npx cdk bootstrap
npm run build
npx cdk synth
npx cdk diff
npx cdk deploy
```

Commit the CDK source and non-secret context to your infrastructure repository. For shared environments, run `cdk deploy` through your normal reviewed CI/CD path rather than relying on a developer workstation.

The deployment is ready when the ECS service has one running task and both target groups report it healthy.

## 6. Retrieve the initial credentials

The stack outputs the Studio URL, telemetry API URL, and secret names. Retrieve the browser password without placing it in source control:

```bash
studio_password_secret="$(aws cloudformation describe-stacks \
  --stack-name KortyxStudio \
  --query "Stacks[0].Outputs[?OutputKey=='StudioPasswordSecretName'].OutputValue" \
  --output text)"

aws secretsmanager get-secret-value \
  --secret-id "$studio_password_secret" \
  --query SecretString \
  --output text
```

Open the `StudioUrl` stack output and sign in as `admin` with that password.

The telemetry write key consists of a stable identifier and the generated secret suffix:

```bash
telemetry_secret_name="$(aws cloudformation describe-stacks \
  --stack-name KortyxStudio \
  --query "Stacks[0].Outputs[?OutputKey=='TelemetryKeySecretName'].OutputValue" \
  --output text)"
telemetry_secret="$(aws secretsmanager get-secret-value \
  --secret-id "$telemetry_secret_name" \
  --query SecretString \
  --output text)"

printf 'ktyx_live_default-telemetry_%s\n' "$telemetry_secret"
unset telemetry_secret
```

Treat both command outputs as secrets. Do not paste them into build logs, tickets, or screenshots.

## 7. Connect an application

Give each Kortyx application's server runtime these values through its secret and configuration system:

```bash file="server environment"
KORTYX_TELEMETRY_API_URL=https://telemetry.example.com
KORTYX_TELEMETRY_API_KEY=ktyx_live_default-telemetry_...
KORTYX_TELEMETRY_ENVIRONMENT=production
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

The application must have a network route to the internal load balancer. Never put the telemetry key in a browser bundle. Continue with [Connect Your Project](./03-connect-project.md) to configure the SDK and publish workflow topology.

## 8. Verify the deployment

From an allowed VPC or VPN client:

```bash
curl --fail https://telemetry.example.com/health
curl --head https://studio.example.com
```

The API health request should return `200`. Studio may return `401` before browser credentials are provided; that is healthy and confirms Basic Auth is active.

If a target remains unhealthy, inspect the task's `database-init`, `api`, and `studio` CloudWatch log streams in that order. Common causes are missing subnet egress to GHCR, an ACM certificate in the wrong Region, a CIDR that does not match the caller's observed address, or database connectivity blocked by a security group.

## Upgrade with CDK

ECS deployments are controlled by CDK, not by the local Docker updater shown in Studio.

1. Back up the RDS database and deployment secrets.
2. Change `kortyxVersion` to the next immutable Studio release.
3. Run `npm run build`, `npx cdk synth`, and `npx cdk diff`.
4. Deploy through the same reviewed path.
5. Wait for the database-init container to succeed and both target groups to become healthy.

The migration/bootstrap command is idempotent and runs whenever ECS starts a replacement task. The ECS deployment circuit breaker can roll back the task definition when a replacement does not become healthy; it does not roll back the database schema. Database downgrade is unsupported, so restore the matching pre-upgrade snapshot if a newer migration is incompatible with the previous release.

> **Expected Studio message:** An ECS/CDK installation does not run the local Docker updater. Update management belongs to your infrastructure repository and deployment workflow.

For backups, credential handling, and failure recovery, continue with [Operations and Troubleshooting](./07-operations.md) and the [Configuration Reference](./08-configuration-reference.md).
