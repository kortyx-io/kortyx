# Deploy Kortyx Studio on AWS with CDK

This guide deploys a production-shaped, single-replica Kortyx Studio installation into an existing AWS VPC. It uses the copyable AWS CDK v2 example in [`deploy/studio/aws-cdk`](../../deploy/studio/aws-cdk).

The stack creates:

1. Studio and the telemetry API together as an ECS Fargate service;
2. PostgreSQL 17 on Amazon RDS;
3. generated credentials in AWS Secrets Manager;
4. an internal Application Load Balancer with HTTPS; and
5. Route 53 names for the private Studio and telemetry endpoints.

The database bootstrap container runs before the API, and Studio waits for the API health check. A failed bootstrap prevents the new task from serving traffic.

## Prerequisites

- AWS CLI credentials with permission to deploy CDK stacks;
- Node.js 22 or newer;
- an existing VPC with private subnets in at least two Availability Zones;
- outbound HTTPS from those subnets so Fargate can pull the GHCR images;
- a Route 53 hosted zone for the two hostnames; and
- an ACM certificate in the deployment Region that covers both hostnames.

The example creates billable AWS resources. Review the synthesized CloudFormation template and expected cost before deployment.

## 1. Create a CDK application

```bash
mkdir kortyx-studio-infra
cd kortyx-studio-infra
npx aws-cdk@latest init app --language typescript
```

## 2. Copy the example

Choose one immutable Studio version. The repository release tag is prefixed with `studio-`; both container images use the version itself:

```bash
kortyx_version=vX.Y.Z
example_base="https://raw.githubusercontent.com/kortyx-io/kortyx/studio-${kortyx_version}/deploy/studio/aws-cdk"

curl --fail --location "${example_base}/lib/kortyx-studio-stack.ts" \
  --output lib/kortyx-studio-stack.ts
curl --fail --location "${example_base}/bin/kortyx-studio.ts" \
  --output bin/kortyx-studio.ts
```

Set the `app` field in `cdk.json`:

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/kortyx-studio.ts"
}
```

## 3. Configure the stack

Add non-secret values to `cdk.context.json`:

```json
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

The stack generates database credentials, the API-key pepper, Project keys, and the browser password directly in Secrets Manager. The load balancer and tasks remain private.

Use a CIDR that reaches the internal load balancer. When a VPN or network appliance translates source addresses, allow the translated address range observed by the load balancer.

## 4. Deploy

```bash
aws sts get-caller-identity
aws configure get region
npx cdk bootstrap
npm run build
npx cdk synth
npx cdk diff
npx cdk deploy
```

For shared environments, deploy committed CDK source through the normal reviewed CI/CD path.

## 5. Retrieve credentials

Use the stack outputs to resolve the generated secrets:

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

Sign in to the `StudioUrl` output as `admin`.

Build the telemetry write key from its retained secret suffix:

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

Treat both outputs as secrets.

## 6. Connect and verify

Configure each application server with:

```bash
KORTYX_TELEMETRY_API_URL=https://telemetry.example.com
KORTYX_TELEMETRY_API_KEY=ktyx_live_default-telemetry_...
KORTYX_TELEMETRY_ENVIRONMENT=production
KORTYX_TELEMETRY_SERVICE_NAME=my-agent
```

From an allowed VPC or VPN client:

```bash
curl --fail https://telemetry.example.com/health
curl --head https://studio.example.com
```

The API should return `200`. Studio may return `401` before credentials are provided; that is healthy.

## Upgrade

ECS deployments are controlled by CDK, not by the local Docker updater shown in Studio:

1. Back up RDS and the deployment secrets.
2. Change `kortyxVersion` to the next immutable Studio release.
3. Build, synthesize, and review the CDK diff.
4. Deploy through the same reviewed path.
5. Wait for database initialization and both target groups to become healthy.

The initialization command is idempotent and runs on every replacement task. The ECS deployment circuit breaker can roll back the task definition, but not the database schema. Database downgrade is unsupported; restore the matching pre-upgrade snapshot if necessary.

See the [deployment contract](./deployment-contract.md), [credentials guide](./credentials-and-secrets.md), and [operations guide](./self-hosted-operations.md) for the platform-independent details.
