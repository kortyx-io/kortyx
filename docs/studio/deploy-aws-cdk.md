# Deploy Kortyx Studio on AWS with CDK

Install `@kortyx/aws-cdk` to deploy Kortyx Studio privately in an existing VPC:

```ts
new KortyxStudio(this, "Studio", {
  vpc,
  domainName: "studio.example.com",
  version: "v0.4.0",
});
```

The construct creates ECS Fargate, PostgreSQL on RDS, generated credentials in Secrets Manager, an internal HTTPS load balancer, and Route 53 DNS. Studio and telemetry share one hostname: `/v1/telemetry/*` and `/health` route to the API, and all other paths route to Studio.

The load balancer accepts traffic from the VPC CIDR by default. Neither the ECS task nor RDS receives a public IP.

## Choose a deployment path

This construct is the maintained, batteries-included AWS path, not a requirement for running Kortyx on AWS. Use it when your infrastructure is managed with CDK and its defaults fit your environment.

The published containers and [deployment contract](deployment-contract.md) can also be implemented with your own ECS service using Terraform, Pulumi, CloudFormation, or lower-level CDK; with EKS; or with Docker Compose on EC2. The construct can reuse an existing database, cluster, certificate, and hosted zone when you want its orchestration without its resource defaults.

`@kortyx/aws-cdk` is an infrastructure dependency, not a dependency of the deployed Kortyx workload. If your organization has standardized on another infrastructure tool, keep it and follow [Deploy on a Server](deploy-on-server.md) for the portable container contract.

## Prerequisites

- AWS CLI credentials with permission to deploy CDK stacks;
- Node.js 22 or newer;
- an existing VPC with private subnets in at least two Availability Zones;
- outbound HTTPS from those subnets so Fargate can pull the public GHCR images; and
- a public Route 53 hosted zone for the parent domain.

The construct creates billable resources. Review `cdk diff` and your expected AWS cost before deployment.

## 1. Create the CDK application

```bash
mkdir kortyx-studio-infra
cd kortyx-studio-infra
npx aws-cdk@latest init app --language typescript
npm install @kortyx/aws-cdk aws-cdk-lib constructs
```

## 2. Add the construct

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
      version: "v0.4.0",
    });
  }
}
```

The construct infers the `example.com` hosted zone from `studio.example.com` and creates a DNS-validated certificate. Pass `hostedZone` or `certificate` when the inferred defaults do not fit your DNS layout. Use an immutable release version; `latest` is rejected.

Useful overrides include:

```ts
new KortyxStudio(this, "Studio", {
  vpc,
  domainName: "studio.example.com",
  version: "v0.4.0",
  allowedCidrs: [vpc.vpcCidrBlock, "10.50.0.0/16"],
  databaseMultiAz: true,
  databaseInstanceType: ec2.InstanceType.of(
    ec2.InstanceClass.T4G,
    ec2.InstanceSize.SMALL,
  ),
});
```

You can also provide an existing `cluster`, `hostedZone`, `certificate`, or `database`.

## Availability model

The `@kortyx/aws-cdk` convenience construct runs one active application task.
This affects availability, not data durability: application state lives in
PostgreSQL, and ECS starts a replacement task after a failure. Studio and
telemetry are briefly unavailable while that task initializes and during a
planned version update.

The Kortyx runtime supports multiple replicas, but the convenience construct
intentionally keeps its cohesive task topology and one-step API. It does not
model an existing load balancer, independently scaled services, or a separate
deployment job. Do not deploy two copies of the construct against one database
to imitate high availability.

When an AWS environment needs continuous application availability, implement
the [multi-replica deployment contract](./high-availability.md) with lower-level
CDK, Terraform, CloudFormation, ECS, or EKS: run migrations once, keep at least
two replicas healthy across Availability Zones, and follow each release's
`rolling` or `recreate` marker.

RDS has seven-day backups and deletion protection. Set `databaseMultiAz: true`
for a database standby and automatic RDS failover; this does not remove the
single application task's restart window.

## 3. Deploy

```bash
aws sts get-caller-identity
aws configure get region
npx cdk bootstrap
npm run build
npx cdk synth
npx cdk diff
npx cdk deploy
```

The deployment is ready when the ECS service has one running task and both target groups report it healthy.

## 4. Retrieve credentials

The CloudFormation outputs include the Studio URL and Secrets Manager names for the browser password and telemetry key suffix. Retrieve the browser password:

```bash
secret_name="$(aws cloudformation describe-stacks \
  --stack-name KortyxStudioInfraStack \
  --query "Stacks[0].Outputs[?contains(OutputKey, 'StudioPasswordSecretName')].OutputValue" \
  --output text)"

aws secretsmanager get-secret-value \
  --secret-id "$secret_name" \
  --query SecretString \
  --output text
```

Open the `StudioUrl` output and sign in as `admin`. The telemetry key is `ktyx_live_default-telemetry_<secret suffix>`; retrieve the suffix from the `TelemetryKeySecretName` output and store the full key in your application's secret manager.

```bash file="server environment"
KORTYX_TELEMETRY_API_URL=https://studio.example.com
KORTYX_TELEMETRY_API_KEY=ktyx_live_default-telemetry_...
KORTYX_TELEMETRY_ENVIRONMENT=production
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

## 5. Verify and upgrade

From an allowed VPC or VPN client:

```bash
curl --fail https://studio.example.com/health
curl --head https://studio.example.com
```

Upgrade by changing `version`, running `cdk diff`, and deploying through the same reviewed path. The Studio message "This installation does not have an in-product updater. Manage updates through your deployment workflow, or use the Kortyx installer for local Docker update management" is normal for orchestrated installations. That workflow might be CDK/ECS on AWS, Terraform or Cloud Deploy on Google Cloud, or Helm/GitOps on Kubernetes. The [multi-replica guide](./high-availability.md) includes a scheduled GitHub Actions pattern for proposing these updates.

The ECS circuit breaker can roll back a failed task definition, but it cannot roll back a database schema. Back up RDS before an upgrade; database downgrade is unsupported.

For operational detail, see [self-hosted operations](./self-hosted-operations.md)
and the [deployment contract](./deployment-contract.md).
