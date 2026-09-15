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
import { Construct } from "constructs";

/** An existing PostgreSQL database that Kortyx Studio should use. */
export interface KortyxStudioDatabase {
  readonly instance: rds.IDatabaseInstance;
  readonly credentialsSecret: secretsmanager.ISecret;
  readonly username?: string;
  readonly databaseName?: string;
}

/** Properties for a private Kortyx Studio installation. */
export interface KortyxStudioProps {
  /** VPC with private subnets and outbound HTTPS access. */
  readonly vpc: ec2.IVpc;
  /** Fully qualified hostname for Studio and the telemetry API. */
  readonly domainName: string;
  /** Immutable Kortyx image tag, for example `v0.3.2`. */
  readonly version: string;
  /**
   * Route 53 zone containing `domainName`.
   *
   * By default the construct looks up the domain with its first label removed,
   * so `studio.example.com` resolves the `example.com` zone.
   */
  readonly hostedZone?: route53.IHostedZone;
  /** Existing regional ACM certificate. A DNS-validated certificate is created by default. */
  readonly certificate?: acm.ICertificate;
  /** CIDRs allowed to reach HTTPS. Defaults to the VPC CIDR. */
  readonly allowedCidrs?: readonly string[];
  /** Existing ECS cluster. A Container Insights-enabled cluster is created by default. */
  readonly cluster?: ecs.ICluster;
  /** Existing PostgreSQL database and credentials. A private RDS instance is created by default. */
  readonly database?: KortyxStudioDatabase;
  /** Instance type for a database created by this construct. */
  readonly databaseInstanceType?: ec2.InstanceType;
  /** Create a Multi-AZ database. Defaults to false. */
  readonly databaseMultiAz?: boolean;
  /** Studio Basic Auth username. Defaults to `admin`. */
  readonly basicAuthUsername?: string;
}

/**
 * A secure-by-default, private Kortyx Studio deployment on ECS Fargate.
 *
 * Studio and telemetry share one hostname. `/v1/telemetry/*` and `/health`
 * route to the API; all other paths route to Studio.
 */
export class KortyxStudio extends Construct {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly database: rds.IDatabaseInstance;
  public readonly studioUrl: string;
  public readonly telemetryApiUrl: string;
  public readonly studioPasswordSecret: secretsmanager.ISecret;
  public readonly telemetryKeySecret: secretsmanager.ISecret;

  public constructor(scope: Construct, id: string, props: KortyxStudioProps) {
    super(scope, id);

    const domainName = validateDomainName(props.domainName);
    const version = validateVersion(props.version);
    const hostedZone =
      props.hostedZone ??
      route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: inferHostedZoneName(domainName),
      });
    const certificate =
      props.certificate ??
      new acm.Certificate(this, "Certificate", {
        domainName,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

    const databaseCredentials =
      props.database?.credentialsSecret ??
      createDatabaseCredentials(this, "DatabaseCredentials");
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
      vpc: props.vpc,
      description: "Network access for the Kortyx Studio ECS task",
      allowAllOutbound: true,
    });

    const database =
      props.database?.instance ??
      createDatabase(
        this,
        props.vpc,
        databaseCredentials,
        props.databaseInstanceType,
        props.databaseMultiAz,
      );
    database.connections.allowDefaultPortFrom(
      taskSecurityGroup,
      "Kortyx API database access",
    );

    const cluster =
      props.cluster ??
      new ecs.Cluster(this, "Cluster", {
        vpc: props.vpc,
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
      `ghcr.io/kortyx-io/kortyx-api:${version}`,
    );
    const studioImage = ecs.ContainerImage.fromRegistry(
      `ghcr.io/kortyx-io/kortyx-studio:${version}`,
    );
    const databaseName = props.database?.databaseName ?? "kortyx";
    const databaseUsername = props.database?.username ?? "kortyx";
    const sharedApiEnvironment = {
      NODE_ENV: "production",
      API_HOST: "0.0.0.0",
      API_PORT: "6400",
      KORTYX_DB_HOST: database.dbInstanceEndpointAddress,
      KORTYX_DB_USER: databaseUsername,
      KORTYX_DB_NAME: databaseName,
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
          "node -e \"fetch('http://127.0.0.1:6400/live').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))\"",
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
        KORTYX_STUDIO_BASIC_AUTH_USERNAME: props.basicAuthUsername ?? "admin",
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
        vpc: props.vpc,
        description: "Private HTTPS access to Kortyx Studio and telemetry",
        allowAllOutbound: true,
      },
    );
    for (const [index, cidr] of (
      props.allowedCidrs ?? [props.vpc.vpcCidrBlock]
    ).entries()) {
      loadBalancerSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(443),
        `Approved VPC or VPN clients (${index + 1})`,
      );
    }
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
        vpc: props.vpc,
        internetFacing: false,
        securityGroup: loadBalancerSecurityGroup,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      },
    );
    const studioTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "StudioTargetGroup",
      {
        vpc: props.vpc,
        targetType: elbv2.TargetType.IP,
        port: 6300,
        protocol: elbv2.ApplicationProtocol.HTTP,
        deregistrationDelay: cdk.Duration.seconds(30),
        healthCheck: { path: "/", healthyHttpCodes: "200-499" },
      },
    );
    studioTargetGroup.addTarget(
      service.loadBalancerTarget({
        containerName: "kortyx-studio",
        containerPort: 6300,
      }),
    );
    const apiTargetGroup = new elbv2.ApplicationTargetGroup(
      this,
      "ApiTargetGroup",
      {
        vpc: props.vpc,
        targetType: elbv2.TargetType.IP,
        port: 6400,
        protocol: elbv2.ApplicationProtocol.HTTP,
        deregistrationDelay: cdk.Duration.seconds(30),
        healthCheck: { path: "/ready", healthyHttpCodes: "200" },
      },
    );
    apiTargetGroup.addTarget(
      service.loadBalancerTarget({
        containerName: "kortyx-api",
        containerPort: 6400,
      }),
    );

    const listener = loadBalancer.addListener("HttpsListener", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultTargetGroups: [studioTargetGroup],
    });
    listener.addTargetGroups("TelemetryRule", {
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(["/v1/telemetry/*", "/health"]),
      ],
      targetGroups: [apiTargetGroup],
    });

    new route53.ARecord(this, "Dns", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(loadBalancer),
      ),
    });

    this.service = service;
    this.loadBalancer = loadBalancer;
    this.database = database;
    this.studioUrl = `https://${domainName}`;
    this.telemetryApiUrl = this.studioUrl;
    this.studioPasswordSecret = basicAuthPassword;
    this.telemetryKeySecret = telemetryKeySecret;

    new cdk.CfnOutput(this, "StudioUrl", { value: this.studioUrl });
    new cdk.CfnOutput(this, "TelemetryApiUrl", {
      value: this.telemetryApiUrl,
    });
    new cdk.CfnOutput(this, "StudioPasswordSecretName", {
      value: basicAuthPassword.secretName,
    });
    new cdk.CfnOutput(this, "TelemetryKeySecretName", {
      value: telemetryKeySecret.secretName,
    });
  }
}

function createDatabaseCredentials(
  scope: Construct,
  id: string,
): secretsmanager.Secret {
  const secret = new secretsmanager.Secret(scope, id, {
    description: "Credentials for the Kortyx Studio PostgreSQL database",
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ username: "kortyx" }),
      generateStringKey: "password",
      excludePunctuation: true,
      passwordLength: 32,
    },
  });
  secret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
  return secret;
}

function createDatabase(
  scope: Construct,
  vpc: ec2.IVpc,
  credentialsSecret: secretsmanager.ISecret,
  instanceType = ec2.InstanceType.of(
    ec2.InstanceClass.T4G,
    ec2.InstanceSize.MICRO,
  ),
  multiAz = false,
): rds.DatabaseInstance {
  return new rds.DatabaseInstance(scope, "Database", {
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    engine: rds.DatabaseInstanceEngine.postgres({
      version: rds.PostgresEngineVersion.VER_17,
    }),
    credentials: rds.Credentials.fromSecret(credentialsSecret),
    databaseName: "kortyx",
    instanceType,
    allocatedStorage: 20,
    maxAllocatedStorage: 100,
    multiAz,
    publiclyAccessible: false,
    storageEncrypted: true,
    backupRetention: cdk.Duration.days(7),
    deletionProtection: true,
    removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
  });
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
          'export KORTYX_TELEMETRY_API_KEY="ktyx_live_$KORTYX_TELEMETRY_KEY_ID"_"$KORTYX_TELEMETRY_KEY_SECRET"',
          'export KORTYX_STUDIO_API_KEY="ktyx_live_$KORTYX_STUDIO_KEY_ID"_"$KORTYX_STUDIO_KEY_SECRET"',
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

function validateDomainName(value: string): string {
  const domainName = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    domainName.length > 253 ||
    !domainName.includes(".") ||
    !domainName
      .split(".")
      .every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
  ) {
    throw new Error(`domainName must be a fully qualified hostname: ${value}`);
  }
  return domainName;
}

function inferHostedZoneName(domainName: string): string {
  return domainName.slice(domainName.indexOf(".") + 1);
}

function validateVersion(value: string): string {
  const version = value.trim();
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(
      `version must be an immutable Kortyx release tag such as v0.3.2: ${value}`,
    );
  }
  return version;
}
