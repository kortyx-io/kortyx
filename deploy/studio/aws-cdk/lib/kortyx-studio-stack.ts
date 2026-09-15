import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface KortyxStudioStackProps extends cdk.StackProps {
  /** An existing VPC with private subnets and outbound HTTPS access. */
  vpcId: string;
  /** An existing Route 53 hosted zone used by both Kortyx hostnames. */
  hostedZoneId: string;
  hostedZoneName: string;
  /** An ACM certificate in this stack's Region that covers both hostnames. */
  certificateArn: string;
  studioDomainName: string;
  telemetryDomainName: string;
  /** VPC or VPN CIDR that may reach the internal load balancer. */
  allowedCidr: string;
  /** Use an immutable published tag, for example v0.3.2. */
  version: string;
}

export class KortyxStudioStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KortyxStudioStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "Vpc", { vpcId: props.vpcId });
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.hostedZoneName,
      },
    );
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "Certificate",
      props.certificateArn,
    );

    const databaseCredentials = new secretsmanager.Secret(
      this,
      "DatabaseCredentials",
      {
        description: "Credentials for the Kortyx Studio PostgreSQL database",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: "kortyx" }),
          generateStringKey: "password",
          excludePunctuation: true,
          passwordLength: 32,
        },
      },
    );
    databaseCredentials.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const apiKeyPepper = generatedSecret(
      this,
      "ApiKeyPepper",
      "Kortyx API-key verifier pepper",
      64,
    );
    const telemetryKeySecret = generatedSecret(
      this,
      "TelemetryKeySecret",
      "Secret portion of the Kortyx telemetry write key",
      48,
    );
    const studioKeySecret = generatedSecret(
      this,
      "StudioKeySecret",
      "Secret portion of the Kortyx Studio read key",
      48,
    );
    const basicAuthPassword = generatedSecret(
      this,
      "BasicAuthPassword",
      "Kortyx Studio Basic Auth password",
      32,
    );

    const taskSecurityGroup = new ec2.SecurityGroup(this, "TaskSecurityGroup", {
      vpc,
      description: "Network access for the Kortyx Studio ECS task",
      allowAllOutbound: true,
    });

    const database = new rds.DatabaseInstance(this, "Database", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17,
      }),
      credentials: rds.Credentials.fromSecret(databaseCredentials),
      databaseName: "kortyx",
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO,
      ),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      multiAz: false,
      publiclyAccessible: false,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });
    database.connections.allowDefaultPortFrom(
      taskSecurityGroup,
      "Kortyx API database access",
    );

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "TaskDefinition",
      {
        cpu: 1024,
        memoryLimitMiB: 2048,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      },
    );
    const logGroup = new logs.LogGroup(this, "LogGroup", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const logDriver = (streamPrefix: string) =>
      ecs.LogDrivers.awsLogs({ logGroup, streamPrefix });

    const apiImage = ecs.ContainerImage.fromRegistry(
      `ghcr.io/kortyx-io/kortyx-api:${props.version}`,
    );
    const studioImage = ecs.ContainerImage.fromRegistry(
      `ghcr.io/kortyx-io/kortyx-studio:${props.version}`,
    );
    const sharedApiEnvironment = {
      NODE_ENV: "production",
      API_HOST: "0.0.0.0",
      API_PORT: "6400",
      KORTYX_DB_HOST: database.dbInstanceEndpointAddress,
      KORTYX_DB_USER: "kortyx",
      KORTYX_DB_NAME: "kortyx",
      KORTYX_TELEMETRY_KEY_ID: "default-telemetry",
      KORTYX_STUDIO_KEY_ID: "default-studio",
    };
    const sharedApiSecrets = {
      KORTYX_DB_PASSWORD: ecs.Secret.fromSecretsManager(
        databaseCredentials,
        "password",
      ),
      KORTYX_API_KEY_PEPPER: ecs.Secret.fromSecretsManager(apiKeyPepper),
    };

    const databaseInit = taskDefinition.addContainer("DatabaseInit", {
      containerName: "kortyx-database-init",
      image: apiImage,
      essential: false,
      entryPoint: ["/bin/sh", "-c"],
      command: [
        apiShellCommand("exec kortyx-studio-db migrate-and-bootstrap", true),
      ],
      memoryReservationMiB: 256,
      logging: logDriver("database-init"),
      environment: sharedApiEnvironment,
      secrets: {
        ...sharedApiSecrets,
        KORTYX_TELEMETRY_KEY_SECRET:
          ecs.Secret.fromSecretsManager(telemetryKeySecret),
        KORTYX_STUDIO_KEY_SECRET:
          ecs.Secret.fromSecretsManager(studioKeySecret),
      },
    });

    const api = taskDefinition.addContainer("Api", {
      containerName: "kortyx-api",
      image: apiImage,
      essential: true,
      entryPoint: ["/bin/sh", "-c"],
      command: [apiShellCommand("exec node apps/api/dist/index.js", false)],
      memoryReservationMiB: 512,
      logging: logDriver("api"),
      environment: sharedApiEnvironment,
      secrets: sharedApiSecrets,
      portMappings: [
        { containerPort: 6400, name: "api", appProtocol: ecs.AppProtocol.http },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:6400/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))\"",
        ],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 5,
        startPeriod: cdk.Duration.seconds(30),
      },
    });
    api.addContainerDependencies({
      container: databaseInit,
      condition: ecs.ContainerDependencyCondition.SUCCESS,
    });

    const studio = taskDefinition.addContainer("Studio", {
      containerName: "kortyx-studio",
      image: studioImage,
      essential: true,
      entryPoint: ["/bin/sh", "-c"],
      command: [
        [
          "set -eu",
          'export KORTYX_STUDIO_API_KEY="ktyx_live_default-studio_$KORTYX_STUDIO_KEY_SECRET"',
          "exec pnpm --filter kortyx-studio start",
        ].join("\n"),
      ],
      memoryReservationMiB: 512,
      logging: logDriver("studio"),
      environment: {
        NODE_ENV: "production",
        PORT: "6300",
        KORTYX_API_URL: "http://127.0.0.1:6400",
        KORTYX_STUDIO_AUTH_MODE: "basic",
        KORTYX_STUDIO_BASIC_AUTH_USERNAME: "admin",
      },
      secrets: {
        KORTYX_STUDIO_KEY_SECRET:
          ecs.Secret.fromSecretsManager(studioKeySecret),
        KORTYX_STUDIO_BASIC_AUTH_PASSWORD:
          ecs.Secret.fromSecretsManager(basicAuthPassword),
      },
      portMappings: [
        {
          containerPort: 6300,
          name: "studio",
          appProtocol: ecs.AppProtocol.http,
        },
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:6300').then((response)=>process.exit(response.status<500?0:1)).catch(()=>process.exit(1))\"",
        ],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 5,
        startPeriod: cdk.Duration.seconds(45),
      },
    });
    studio.addContainerDependencies({
      container: api,
      condition: ecs.ContainerDependencyCondition.HEALTHY,
    });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [taskSecurityGroup],
      circuitBreaker: { rollback: true },
      minHealthyPercent: 0,
      maxHealthyPercent: 100,
      healthCheckGracePeriod: cdk.Duration.minutes(3),
    });

    const loadBalancerSecurityGroup = new ec2.SecurityGroup(
      this,
      "LoadBalancerSecurityGroup",
      {
        vpc,
        description: "Private HTTPS access to Kortyx Studio and telemetry",
        allowAllOutbound: true,
      },
    );
    loadBalancerSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.allowedCidr),
      ec2.Port.tcp(443),
      "Approved VPC or VPN clients",
    );
    taskSecurityGroup.addIngressRule(
      loadBalancerSecurityGroup,
      ec2.Port.tcp(6300),
      "Internal ALB to Studio",
    );
    taskSecurityGroup.addIngressRule(
      loadBalancerSecurityGroup,
      ec2.Port.tcp(6400),
      "Internal ALB to telemetry API",
    );

    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "LoadBalancer",
      {
        vpc,
        internetFacing: false,
        securityGroup: loadBalancerSecurityGroup,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    );
    const listener = loadBalancer.addListener("HttpsListener", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: "text/plain",
        messageBody: "Not found",
      }),
    });

    const studioTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "StudioTargetGroup",
      {
        vpc,
        targetType: elbv2.TargetType.IP,
        port: 6300,
        protocol: elbv2.ApplicationProtocol.HTTP,
        deregistrationDelay: cdk.Duration.seconds(30),
        healthCheck: {
          path: "/",
          healthyHttpCodes: "200-499",
        },
      },
    );
    studioTargetGroup.addTarget(
      service.loadBalancerTarget({
        containerName: "kortyx-studio",
        containerPort: 6300,
      }),
    );
    listener.addTargetGroups("StudioRule", {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([props.studioDomainName]),
      ],
      targetGroups: [studioTargetGroup],
    });

    const apiTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "ApiTargetGroup",
      {
        vpc,
        targetType: elbv2.TargetType.IP,
        port: 6400,
        protocol: elbv2.ApplicationProtocol.HTTP,
        deregistrationDelay: cdk.Duration.seconds(30),
        healthCheck: { path: "/health", healthyHttpCodes: "200" },
      },
    );
    apiTargetGroup.addTarget(
      service.loadBalancerTarget({
        containerName: "kortyx-api",
        containerPort: 6400,
      }),
    );
    listener.addTargetGroups("TelemetryRule", {
      priority: 20,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([props.telemetryDomainName]),
      ],
      targetGroups: [apiTargetGroup],
    });

    addAliasRecord(
      this,
      "StudioDns",
      hostedZone,
      props.studioDomainName,
      loadBalancer,
    );
    addAliasRecord(
      this,
      "TelemetryDns",
      hostedZone,
      props.telemetryDomainName,
      loadBalancer,
    );

    new cdk.CfnOutput(this, "StudioUrl", {
      value: `https://${props.studioDomainName}`,
    });
    new cdk.CfnOutput(this, "TelemetryApiUrl", {
      value: `https://${props.telemetryDomainName}`,
    });
    new cdk.CfnOutput(this, "StudioPasswordSecretName", {
      value: basicAuthPassword.secretName,
    });
    new cdk.CfnOutput(this, "TelemetryKeySecretName", {
      value: telemetryKeySecret.secretName,
    });
  }
}

function apiShellCommand(
  command: string,
  includeBootstrapKeys: boolean,
): string {
  return [
    "set -eu",
    'export DATABASE_URL="postgresql://$KORTYX_DB_USER:$KORTYX_DB_PASSWORD@$KORTYX_DB_HOST:5432/$KORTYX_DB_NAME?sslmode=require"',
    ...(includeBootstrapKeys
      ? [
          `export KORTYX_TELEMETRY_API_KEY="ktyx_live_\${KORTYX_TELEMETRY_KEY_ID}_\${KORTYX_TELEMETRY_KEY_SECRET}"`,
          `export KORTYX_STUDIO_API_KEY="ktyx_live_\${KORTYX_STUDIO_KEY_ID}_\${KORTYX_STUDIO_KEY_SECRET}"`,
        ]
      : []),
    command,
  ].join("\n");
}

function generatedSecret(
  scope: Construct,
  id: string,
  description: string,
  passwordLength: number,
): secretsmanager.Secret {
  const secret = new secretsmanager.Secret(scope, id, {
    description,
    generateSecretString: { excludePunctuation: true, passwordLength },
  });
  secret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
  return secret;
}

function addAliasRecord(
  scope: Construct,
  id: string,
  zone: route53.IHostedZone,
  recordName: string,
  loadBalancer: elbv2.ApplicationLoadBalancer,
): void {
  new route53.ARecord(scope, id, {
    zone,
    recordName,
    target: route53.RecordTarget.fromAlias(
      new route53Targets.LoadBalancerTarget(loadBalancer),
    ),
  });
}
