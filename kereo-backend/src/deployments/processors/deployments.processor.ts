import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import {
  BatchGetBuildsCommand,
  Build,
  CodeBuildClient,
  StartBuildCommand,
} from '@aws-sdk/client-codebuild';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  CreateServiceCommand,
  DescribeServicesCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
  waitUntilServicesStable,
} from '@aws-sdk/client-ecs';
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { Client } from 'pg';

import {
  Deployment,
  DeploymentPhase,
  DeploymentStatus,
} from '../entities/deployment.entity';
import { GithubService } from '../../github/github.service';
import { ProjectsService } from '../../projects/projects.service';
import { ProjectDatabaseMode } from '../../projects/entities/project.entity';

@Injectable()
@Processor('deployments', {
  concurrency: 2,
  lockDuration: 600000,
  maxStalledCount: 3,
  stalledInterval: 30000,
})
export class DeploymentsProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    @InjectRepository(Deployment)
    private readonly deploymentsRepository: Repository<Deployment>,
    private readonly githubService: GithubService,
    private readonly projectsService: ProjectsService,
  ) {
    super();
    console.log('DeploymentsProcessor initialized');
  }

  onModuleInit() {
    this.getRequiredJwtSecretParamArn();
  }

  async process(job: Job<{ deploymentId: string }>) {
    console.log('Processing deployment job:', job.id, job.data);

    const { deploymentId } = job.data;

    const deployment = await this.deploymentsRepository.findOne({
      where: { id: deploymentId },
      relations: ['project'],
    });

    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const branch = deployment.project.branch ?? 'main';
    const dockerfilePath = deployment.project.dockerfilePath ?? 'Dockerfile';
    const buildContext = deployment.project.buildContext ?? '.';
    const port = deployment.project.port ?? 3000;
    const databaseMode =
      deployment.project.databaseMode ?? ProjectDatabaseMode.MANAGED_POSTGRES;

    try {
      const awsRegion = process.env.AWS_REGION;
      const awsAccountId = process.env.AWS_ACCOUNT_ID;
      const ecrRepository = process.env.ECR_REPOSITORY;
      const codebuildProjectName = process.env.CODEBUILD_PROJECT_NAME;
      const ecsClusterName = process.env.ECS_CLUSTER_NAME;
      const ecsTaskExecutionRoleArn = process.env.ECS_TASK_EXECUTION_ROLE_ARN;
      const ecsSubnetIds = process.env.ECS_SUBNET_IDS;
      const fallbackEcsSecurityGroupId = process.env.ECS_SECURITY_GROUP_ID;
      const jwtSecretParamArn = this.getRequiredJwtSecretParamArn();
      const coreDatabaseUrl =
        databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES
          ? this.getRequiredCoreDatabaseUrl()
          : null;

      const missingEcrVariables = [
        ['AWS_REGION', awsRegion],
        ['AWS_ACCOUNT_ID', awsAccountId],
        ['ECR_REPOSITORY', ecrRepository],
        ['CODEBUILD_PROJECT_NAME', codebuildProjectName],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);

      if (missingEcrVariables.length > 0) {
        throw new Error(
          `Missing AWS ECR environment variables: ${missingEcrVariables.join(', ')}`,
        );
      }

      const missingEcsVariables = [
        ['ECS_CLUSTER_NAME', ecsClusterName],
        ['ECS_TASK_EXECUTION_ROLE_ARN', ecsTaskExecutionRoleArn],
        ['ECS_SUBNET_IDS', ecsSubnetIds],
        ['ECS_SECURITY_GROUP_ID', fallbackEcsSecurityGroupId],
        ['JWT_SECRET_PARAM_ARN', jwtSecretParamArn],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);

      if (missingEcsVariables.length > 0) {
        throw new Error(
          `Missing AWS ECS environment variables: ${missingEcsVariables.join(', ')}`,
        );
      }

      const resolvedAwsRegion = awsRegion as string;
      const resolvedAwsAccountId = awsAccountId as string;
      const resolvedEcrRepository = ecrRepository as string;
      const resolvedCodebuildProjectName = codebuildProjectName as string;
      const resolvedEcsClusterName = ecsClusterName as string;
      const resolvedEcsTaskExecutionRoleArn = ecsTaskExecutionRoleArn as string;
      const resolvedEcsSubnetIds = (ecsSubnetIds as string)
        .split(',')
        .map((subnetId) => subnetId.trim())
        .filter(Boolean);
      const resolvedEcsSecurityGroupIds = (
        deployment.project.ecsSecurityGroupId ?? fallbackEcsSecurityGroupId
      )
        .split(',')
        .map((securityGroupId) => securityGroupId.trim())
        .filter(Boolean);
      const resolvedJwtSecretParamArn = jwtSecretParamArn;

      if (
        resolvedEcsSubnetIds.length === 0 ||
        resolvedEcsSecurityGroupIds.length === 0
      ) {
        throw new Error(
          'ECS_SUBNET_IDS and ECS_SECURITY_GROUP_ID must contain at least one value',
        );
      }

      const projectSlug = deployment.project.slug;
      const projectEcsServiceName = deployment.project.ecsServiceName;
      const projectEcsTaskFamily = deployment.project.ecsTaskFamily;
      const projectTargetGroupArn = deployment.project.targetGroupArn;

      const missingProjectAwsMetadata = [
        ['project.slug', projectSlug],
        ['project.ecsServiceName', projectEcsServiceName],
        ['project.ecsTaskFamily', projectEcsTaskFamily],
        ['project.targetGroupArn', projectTargetGroupArn],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);

      if (missingProjectAwsMetadata.length > 0) {
        throw new Error(
          `Missing project AWS metadata: ${missingProjectAwsMetadata.join(', ')}`,
        );
      }

      const ecrRegistry = `${resolvedAwsAccountId}.dkr.ecr.${resolvedAwsRegion}.amazonaws.com`;
      const ecrImageTag = `${ecrRegistry}/${resolvedEcrRepository}:${deployment.id}`;
      const codebuildClient = new CodeBuildClient({
        region: resolvedAwsRegion,
      });
      const ecsClient = new ECSClient({ region: resolvedAwsRegion });
      const logsClient = new CloudWatchLogsClient({
        region: resolvedAwsRegion,
      });
      const ssmClient = new SSMClient({ region: resolvedAwsRegion });
      const projectEnvVars = await this.projectsService.getProjectEnvVarValues(
        deployment.project.id,
      );
      const projectDatabaseName =
        databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES
          ? this.buildProjectDatabaseName(projectSlug, deployment.project.id)
          : null;
      const projectDatabaseUrl =
        databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES && coreDatabaseUrl
          ? this.buildProjectDatabaseUrl(coreDatabaseUrl, projectDatabaseName!)
          : null;
      const projectDatabaseParamName =
        databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES
          ? this.buildProjectDatabaseParamName(deployment.project.id)
          : null;
      const projectDatabaseParamArn =
        databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES &&
        projectDatabaseParamName
          ? this.buildParameterArn({
              awsRegion: resolvedAwsRegion,
              awsAccountId: resolvedAwsAccountId,
              parameterName: projectDatabaseParamName,
            })
          : null;
      const githubToken =
        deployment.project.githubInstallationId &&
        deployment.project.githubRepositoryFullName
          ? await this.githubService.getInstallationToken(
              deployment.project.githubInstallationId,
            )
          : null;

      const existingCodeBuildId = await this.findReusableCodeBuildId(
        codebuildClient,
        deployment,
      );

      if (!existingCodeBuildId) {
        await this.updateDeployment(
          deployment,
          DeploymentStatus.CLONING,
          DeploymentPhase.BUILD,
          'Preparing build',
          `Queued remote build for ${deployment.project.repoUrl} (${branch}).\n`,
        );

        await this.updateDeployment(
          deployment,
          DeploymentStatus.BUILDING,
          DeploymentPhase.BUILD,
          'Starting CodeBuild',
          [
            'Starting CodeBuild image build...',
            `Repository: ${deployment.project.repoUrl}`,
            `Branch: ${branch}`,
            `Runtime: ${deployment.project.runtimeType}`,
            `Database mode: ${databaseMode}`,
            `Health check: ${deployment.project.healthCheckPath}`,
            `Build context: ${buildContext}`,
            `Dockerfile: ${dockerfilePath}`,
            `Environment vars: ${projectEnvVars.filter((envVar) => !envVar.isSecret).length}`,
            `Secret vars: ${projectEnvVars.filter((envVar) => envVar.isSecret).length}`,
            '',
          ].join('\n'),
        );
      } else {
        deployment.status = DeploymentStatus.PUSHING;
        deployment.phase = DeploymentPhase.BUILD;
        deployment.phaseLabel = 'Resuming CodeBuild';
        await this.deploymentsRepository.save(deployment);
        await this.appendLog(
          deployment,
          `Resuming deployment with existing CodeBuild build.\nBuild id: ${existingCodeBuildId}\n`,
        );
      }

      await this.updateDeployment(
        deployment,
        DeploymentStatus.PUSHING,
        DeploymentPhase.BUILD,
        'Building image',
        `Building and pushing image with CodeBuild.\nECR image: ${ecrImageTag}\n`,
      );

      const build = existingCodeBuildId
        ? ({ id: existingCodeBuildId } as Build)
        : await this.startCodeBuild(codebuildClient, {
            projectName: resolvedCodebuildProjectName,
            repoUrl: deployment.project.repoUrl,
            branch,
            buildContext,
            dockerfilePath,
            imageUri: ecrImageTag,
            ecrRegistry,
            port,
            appBasePath: '/',
            githubToken,
            projectEnvVars,
          });

      if (!existingCodeBuildId) {
        deployment.codebuildBuildId = build.id ?? null;
        deployment.codebuildStatus = 'IN_PROGRESS';
        await this.deploymentsRepository.save(deployment);
        await this.appendLog(
          deployment,
          `CodeBuild started.\nBuild id: ${build.id}\n`,
        );
      } else {
        deployment.codebuildBuildId = existingCodeBuildId;
        await this.deploymentsRepository.save(deployment);
      }

      const completedBuild = await this.waitForCodeBuild(
        codebuildClient,
        build,
        async (message, buildStatus, phaseLabel) => {
          deployment.codebuildStatus = buildStatus;
          deployment.phase = DeploymentPhase.BUILD;
          deployment.phaseLabel = phaseLabel;
          await this.deploymentsRepository.save(deployment);
          await this.appendLog(deployment, message);
        },
      );

      deployment.commitSha =
        completedBuild.resolvedSourceVersion ?? deployment.commitSha;
      deployment.codebuildBuildId =
        completedBuild.id ?? deployment.codebuildBuildId;
      deployment.codebuildStatus = completedBuild.buildStatus ?? 'SUCCEEDED';
      deployment.imageUrl = ecrImageTag;
      await this.deploymentsRepository.save(deployment);

      await this.updateDeployment(
        deployment,
        DeploymentStatus.DEPLOYING,
        DeploymentPhase.BUILD,
        'Image ready',
        `Image pushed to ECR successfully.\nImage: ${ecrImageTag}\n`,
      );

      let resolvedDatabaseUrlParamArn: string | null = null;

      if (databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES) {
        deployment.databaseName = projectDatabaseName;
        await this.deploymentsRepository.save(deployment);
        await this.appendLog(
          deployment,
          `Ensuring dedicated project database exists.\nDatabase name: ${projectDatabaseName}\n`,
        );
        await this.setPhase(
          deployment,
          DeploymentPhase.DATABASE,
          'Creating database',
        );

        await this.ensureProjectDatabase(
          coreDatabaseUrl!,
          projectDatabaseName!,
        );

        await this.setPhase(
          deployment,
          DeploymentPhase.SECRETS,
          'Writing secrets',
        );
        await this.appendLog(
          deployment,
          `Storing project database URL in SSM.\nParameter: ${projectDatabaseParamName}\n`,
        );

        await this.putProjectDatabaseUrlParameter(ssmClient, {
          parameterName: projectDatabaseParamName!,
          databaseUrl: projectDatabaseUrl!,
        });
        resolvedDatabaseUrlParamArn = projectDatabaseParamArn;
      } else if (databaseMode === ProjectDatabaseMode.EXTERNAL_DATABASE_URL) {
        const databaseUrlSecret = projectEnvVars.find(
          (envVar) => envVar.key === 'DATABASE_URL' && envVar.isSecret,
        );

        if (!databaseUrlSecret?.value) {
          throw new Error(
            'External database mode requires a secret DATABASE_URL environment variable',
          );
        }

        await this.setPhase(
          deployment,
          DeploymentPhase.SECRETS,
          'Writing secrets',
        );
        await this.appendLog(
          deployment,
          'Using external DATABASE_URL secret provided in project environment variables.\n',
        );
      } else {
        deployment.databaseName = null;
        await this.deploymentsRepository.save(deployment);
        await this.setPhase(
          deployment,
          DeploymentPhase.SECRETS,
          'Preparing runtime config',
        );
        await this.appendLog(
          deployment,
          'Database provisioning disabled for this project.\n',
        );
      }

      await this.setPhase(
        deployment,
        DeploymentPhase.LOGGING,
        'Preparing logs',
      );
      await this.appendLog(
        deployment,
        `Ensuring CloudWatch log group exists.\nLog group: /ecs/${projectSlug}\n`,
      );

      await this.ensureLogGroup(logsClient, `/ecs/${projectSlug}`);

      await this.setPhase(
        deployment,
        DeploymentPhase.ECS,
        'Registering task definition',
      );
      await this.appendLog(deployment, 'Registering ECS task definition...\n');
      await this.appendLog(
        deployment,
        `ECS service name: ${projectEcsServiceName}\nECS task family: ${projectEcsTaskFamily}\n`,
      );
      await this.appendLog(
        deployment,
        `Using SSM Parameter Store secrets.\n${
          resolvedDatabaseUrlParamArn
            ? `DATABASE_URL parameter: ${resolvedDatabaseUrlParamArn}\n`
            : 'DATABASE_URL parameter: not managed by Kereo\n'
        }JWT_SECRET parameter: ${resolvedJwtSecretParamArn}\n`,
      );

      const secretEnvParams = await this.putProjectSecretParameters(ssmClient, {
        projectId: deployment.project.id,
        envVars: projectEnvVars,
      });

      const taskDefinitionArn = await this.registerTaskDefinition(ecsClient, {
        family: projectEcsTaskFamily,
        executionRoleArn: resolvedEcsTaskExecutionRoleArn,
        containerName: projectSlug,
        image: ecrImageTag,
        port,
        databaseUrlParamArn: resolvedDatabaseUrlParamArn,
        jwtSecretParamArn: resolvedJwtSecretParamArn,
        awsRegion: resolvedAwsRegion,
        envVars: projectEnvVars
          .filter((envVar) => !envVar.isSecret)
          .map((envVar) => ({
            name: envVar.key,
            value: envVar.value,
          })),
        secretEnvVars: secretEnvParams,
      });

      await this.appendLog(
        deployment,
        `Registered ECS task definition: ${taskDefinitionArn}\n`,
      );
      deployment.taskDefinitionArn = taskDefinitionArn;
      await this.deploymentsRepository.save(deployment);

      const serviceExists = await this.ecsServiceExists(ecsClient, {
        cluster: resolvedEcsClusterName,
        serviceName: projectEcsServiceName,
      });

      if (serviceExists) {
        await this.appendLog(
          deployment,
          `Updating ECS service: ${projectEcsServiceName}\n`,
        );

        await this.updateEcsService(ecsClient, {
          cluster: resolvedEcsClusterName,
          serviceName: projectEcsServiceName,
          taskDefinitionArn,
        });
      } else {
        await this.appendLog(
          deployment,
          `Creating ECS service: ${projectEcsServiceName}\n`,
        );

        await this.createEcsService(ecsClient, {
          cluster: resolvedEcsClusterName,
          serviceName: projectEcsServiceName,
          taskDefinitionArn,
          subnetIds: resolvedEcsSubnetIds,
          securityGroupIds: resolvedEcsSecurityGroupIds,
          targetGroupArn: projectTargetGroupArn,
          containerName: projectSlug,
          containerPort: port,
        });
      }

      await this.appendLog(
        deployment,
        'ECS service update requested. Waiting for service stability...\n',
      );
      await this.setPhase(
        deployment,
        DeploymentPhase.ECS,
        'Waiting for ECS stability',
      );

      try {
        await waitUntilServicesStable(
          {
            client: ecsClient,
            maxWaitTime: 1200,
            minDelay: 15,
            maxDelay: 30,
          },
          {
            cluster: resolvedEcsClusterName,
            services: [projectEcsServiceName],
          },
        );
      } catch (error) {
        const serviceDetails = await ecsClient.send(
          new DescribeServicesCommand({
            cluster: resolvedEcsClusterName,
            services: [projectEcsServiceName],
          }),
        );

        const events = serviceDetails.services?.[0]?.events ?? [];
        const eventLogs = events
          .slice(0, 10)
          .map((event) => `${event.createdAt?.toISOString()}: ${event.message}`)
          .join('\n');

        if (eventLogs) {
          await this.appendLog(
            deployment,
            `Recent ECS service events:\n${eventLogs}\n`,
          );
        }

        throw error;
      }

      const liveUrl = deployment.project.publicUrl;
      const liveUrlLog = liveUrl
        ? `Deployment is live at: ${liveUrl}\n`
        : 'No public URL configured yet.\n';

      deployment.liveUrl = liveUrl ?? null;

      await this.updateDeployment(
        deployment,
        DeploymentStatus.SUCCESS,
        DeploymentPhase.LIVE,
        'Live',
        `ECS service is stable.\nDeployment completed successfully.\nTask definition: ${taskDefinitionArn}\n${liveUrlLog}`,
      );

      return {
        success: true,
        imageTag: ecrImageTag,
        taskDefinitionArn,
        liveUrl,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown deployment error';

      deployment.status = DeploymentStatus.FAILED;
      deployment.phase = DeploymentPhase.FAILED;
      deployment.phaseLabel = 'Failed';
      deployment.errorMessage = message;
      deployment.logs = `${deployment.logs ?? ''}\nDeployment failed:\n${message}\n`;

      await this.deploymentsRepository.save(deployment);

      throw error;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    console.log('Deployment job active:', job.id, job.name, job.data);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    console.log('Deployment job completed:', job.id, job.name);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error) {
    console.error('Deployment job failed:', job?.id, job?.name, error.message);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string, previousState: string) {
    console.warn('Deployment job stalled:', jobId, previousState);
  }

  private async updateDeployment(
    deployment: Deployment,
    status: DeploymentStatus,
    phase: DeploymentPhase,
    phaseLabel: string,
    log: string,
  ) {
    deployment.status = status;
    deployment.phase = phase;
    deployment.phaseLabel = phaseLabel;
    deployment.logs = `${deployment.logs ?? ''}${log}`;
    await this.deploymentsRepository.save(deployment);
  }

  private async setPhase(
    deployment: Deployment,
    phase: DeploymentPhase,
    phaseLabel: string,
  ) {
    deployment.phase = phase;
    deployment.phaseLabel = phaseLabel;
    await this.deploymentsRepository.save(deployment);
  }

  private async appendLog(deployment: Deployment, log: string) {
    deployment.logs = `${deployment.logs ?? ''}${log}`;
    await this.deploymentsRepository.save(deployment);
  }

  private getRequiredJwtSecretParamArn() {
    const jwtSecretParamArn = process.env.JWT_SECRET_PARAM_ARN;
    const missingVariables = [['JWT_SECRET_PARAM_ARN', jwtSecretParamArn]]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missingVariables.length > 0) {
      throw new Error(
        `Missing ECS JWT SSM Parameter Store environment variables: ${missingVariables.join(', ')}`,
      );
    }

    return jwtSecretParamArn as string;
  }

  private getRequiredCoreDatabaseUrl() {
    const databaseUrl =
      process.env.DATABASE_URL || process.env.APP_DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        'Missing DATABASE_URL environment variable (or APP_DATABASE_URL)',
      );
    }

    return databaseUrl;
  }

  private buildProjectDatabaseName(projectSlug: string, projectId: string) {
    const normalizedSlug = projectSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
    const fallbackSlug = normalizedSlug || 'app';
    const projectSuffix = projectId.replace(/-/g, '').slice(0, 8);
    const maxSlugLength = Math.max(
      1,
      63 - 'app__'.length - projectSuffix.length,
    );
    const truncatedSlug = fallbackSlug.slice(0, maxSlugLength);

    return `app_${truncatedSlug}_${projectSuffix}`;
  }

  private buildProjectDatabaseUrl(
    coreDatabaseUrl: string,
    databaseName: string,
  ) {
    const databaseUrl = new URL(coreDatabaseUrl);
    databaseUrl.pathname = `/${databaseName}`;

    return databaseUrl.toString();
  }

  private buildProjectDatabaseParamName(projectId: string) {
    const projectName = process.env.PROJECT_NAME ?? 'kereo-v2';
    return `/${projectName}/prod/apps/${projectId}/DATABASE_URL`;
  }

  private buildParameterArn(input: {
    awsRegion: string;
    awsAccountId: string;
    parameterName: string;
  }) {
    const sanitizedName = input.parameterName.replace(/^\//, '');
    return `arn:aws:ssm:${input.awsRegion}:${input.awsAccountId}:parameter/${sanitizedName}`;
  }

  private async ensureProjectDatabase(
    coreDatabaseUrl: string,
    databaseName: string,
  ) {
    const adminClient = new Client({
      connectionString: coreDatabaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    await adminClient.connect();

    try {
      const existingDatabase = await adminClient.query<{ exists: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS "exists"',
        [databaseName],
      );

      if (existingDatabase.rows[0]?.exists) {
        return;
      }

      await adminClient.query(
        `CREATE DATABASE ${this.quoteIdentifier(databaseName)}`,
      );
    } finally {
      await adminClient.end();
    }
  }

  private quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private async putProjectDatabaseUrlParameter(
    ssmClient: SSMClient,
    input: {
      parameterName: string;
      databaseUrl: string;
    },
  ) {
    await ssmClient.send(
      new PutParameterCommand({
        Name: input.parameterName,
        Value: input.databaseUrl,
        Type: 'SecureString',
        Overwrite: true,
      }),
    );
  }

  private async ensureLogGroup(
    logsClient: CloudWatchLogsClient,
    logGroupName: string,
  ) {
    try {
      await logsClient.send(
        new CreateLogGroupCommand({
          logGroupName,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'ResourceAlreadyExistsException'
      ) {
        return;
      }

      throw error;
    }
  }

  private async findReusableCodeBuildId(
    codebuildClient: CodeBuildClient,
    deployment: Deployment,
  ) {
    const buildId = this.extractLatestCodeBuildId(deployment.logs);

    if (!buildId) {
      return null;
    }

    try {
      const result = await codebuildClient.send(
        new BatchGetBuildsCommand({
          ids: [buildId],
        }),
      );

      const existingBuild = result.builds?.[0];

      if (!existingBuild?.id) {
        return null;
      }

      const buildStatus = existingBuild.buildStatus ?? 'UNKNOWN';

      if (
        buildStatus === 'FAILED' ||
        buildStatus === 'FAULT' ||
        buildStatus === 'STOPPED' ||
        buildStatus === 'TIMED_OUT'
      ) {
        await this.appendLog(
          deployment,
          `Previous CodeBuild build is not reusable.\nBuild id: ${buildId}\nStatus: ${buildStatus}\n`,
        );
        return null;
      }

      return existingBuild.id;
    } catch {
      return null;
    }
  }

  private extractLatestCodeBuildId(logs?: string | null) {
    if (!logs) {
      return null;
    }

    const matches = [...logs.matchAll(/Build id:\s+([^\s]+)/g)];
    return matches.at(-1)?.[1] ?? null;
  }

  private async startCodeBuild(
    codebuildClient: CodeBuildClient,
    input: {
      projectName: string;
      repoUrl: string;
      branch: string;
      buildContext: string;
      dockerfilePath: string;
      imageUri: string;
      ecrRegistry: string;
      port: number;
      appBasePath: string;
      githubToken: string | null;
      projectEnvVars: Array<{
        key: string;
        value: string;
        isSecret: boolean;
        exposeToBuild: boolean;
      }>;
    },
  ) {
    const buildEnvVars = input.projectEnvVars.filter(
      (envVar) => envVar.exposeToBuild,
    );
    const buildArgKeys = buildEnvVars.map((envVar) => envVar.key).join(' ');
    const buildResult = await codebuildClient.send(
      new StartBuildCommand({
        projectName: input.projectName,
        environmentVariablesOverride: [
          { name: 'REPO_URL', value: input.repoUrl, type: 'PLAINTEXT' },
          { name: 'REPO_BRANCH', value: input.branch, type: 'PLAINTEXT' },
          {
            name: 'BUILD_CONTEXT',
            value: input.buildContext,
            type: 'PLAINTEXT',
          },
          {
            name: 'DOCKERFILE_PATH',
            value: input.dockerfilePath,
            type: 'PLAINTEXT',
          },
          { name: 'IMAGE_URI', value: input.imageUri, type: 'PLAINTEXT' },
          {
            name: 'ECR_REGISTRY',
            value: input.ecrRegistry,
            type: 'PLAINTEXT',
          },
          { name: 'APP_PORT', value: String(input.port), type: 'PLAINTEXT' },
          {
            name: 'APP_BASE_PATH',
            value: input.appBasePath,
            type: 'PLAINTEXT',
          },
          {
            name: 'DOCKER_BUILD_ARG_KEYS',
            value: buildArgKeys,
            type: 'PLAINTEXT',
          },
          ...buildEnvVars.map((envVar) => ({
            name: envVar.key,
            value: envVar.value,
            type: 'PLAINTEXT' as const,
          })),
          ...(input.githubToken
            ? [
                {
                  name: 'GITHUB_TOKEN',
                  value: input.githubToken,
                  type: 'PLAINTEXT' as const,
                },
              ]
            : []),
        ],
      }),
    );

    if (!buildResult.build?.id) {
      throw new Error('CodeBuild did not return a build id');
    }

    return buildResult.build;
  }

  private async waitForCodeBuild(
    codebuildClient: CodeBuildClient,
    build: Build,
    onProgress: (
      message: string,
      buildStatus: string,
      phaseLabel: string,
    ) => Promise<void>,
  ) {
    let lastPhase: string | null = null;
    let lastStatus: string | null = null;

    while (true) {
      const result = await codebuildClient.send(
        new BatchGetBuildsCommand({
          ids: [build.id as string],
        }),
      );

      const currentBuild = result.builds?.[0];

      if (!currentBuild) {
        throw new Error(`CodeBuild build not found: ${build.id}`);
      }

      const currentPhase = currentBuild.currentPhase ?? 'UNKNOWN';
      const currentStatus = currentBuild.buildStatus ?? 'UNKNOWN';

      if (currentPhase !== lastPhase || currentStatus !== lastStatus) {
        await onProgress(
          `CodeBuild status: ${currentStatus}${currentPhase ? ` (${currentPhase})` : ''}\n`,
          currentStatus,
          this.describeCodeBuildPhase(currentPhase, currentStatus),
        );
        lastPhase = currentPhase;
        lastStatus = currentStatus;
      }

      if (currentStatus === 'SUCCEEDED') {
        return currentBuild;
      }

      if (
        currentStatus === 'FAILED' ||
        currentStatus === 'FAULT' ||
        currentStatus === 'STOPPED' ||
        currentStatus === 'TIMED_OUT'
      ) {
        const phases = currentBuild.phases ?? [];
        const phaseSummary = phases
          .filter((phase) => phase.phaseStatus)
          .map((phase) => {
            const context = phase.contexts
              ?.map((item) => item.message)
              .join('; ');
            return `- ${phase.phaseType}: ${phase.phaseStatus}${context ? ` (${context})` : ''}`;
          })
          .join('\n');

        throw new Error(
          [
            `CodeBuild failed with status ${currentStatus}.`,
            phaseSummary ? `Phases:\n${phaseSummary}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  private describeCodeBuildPhase(currentPhase: string, currentStatus: string) {
    const phaseLabelMap: Record<string, string> = {
      SUBMITTED: 'Submitting build',
      QUEUED: 'Queued in CodeBuild',
      PROVISIONING: 'Provisioning build environment',
      DOWNLOAD_SOURCE: 'Downloading source',
      INSTALL: 'Installing build environment',
      PRE_BUILD: 'Preparing build',
      BUILD: 'Building image',
      POST_BUILD: 'Pushing image',
      UPLOAD_ARTIFACTS: 'Finalizing build artifacts',
      COMPLETED:
        currentStatus === 'SUCCEEDED' ? 'Build complete' : 'Finishing build',
    };

    return (
      phaseLabelMap[currentPhase] ?? `CodeBuild ${currentPhase.toLowerCase()}`
    );
  }

  private async registerTaskDefinition(
    ecsClient: ECSClient,
    input: {
      family: string;
      executionRoleArn: string;
      containerName: string;
      image: string;
      port: number;
      databaseUrlParamArn: string | null;
      jwtSecretParamArn: string;
      awsRegion: string;
      envVars: Array<{ name: string; value: string }>;
      secretEnvVars: Array<{ name: string; valueFrom: string }>;
    },
  ) {
    const taskDefinitionResult = await ecsClient.send(
      new RegisterTaskDefinitionCommand({
        family: input.family,
        executionRoleArn: input.executionRoleArn,
        networkMode: 'awsvpc',
        requiresCompatibilities: ['FARGATE'],
        cpu: '256',
        memory: '512',
        containerDefinitions: [
          {
            name: input.containerName,
            image: input.image,
            essential: true,
            portMappings: [
              {
                containerPort: input.port,
                protocol: 'tcp',
              },
            ],
            environment: [
              {
                name: 'NODE_ENV',
                value: 'production',
              },
              {
                name: 'PORT',
                value: String(input.port),
              },
              ...input.envVars,
            ],
            secrets: [
              ...(input.databaseUrlParamArn
                ? [
                    {
                      name: 'DATABASE_URL',
                      valueFrom: input.databaseUrlParamArn,
                    },
                  ]
                : []),
              {
                name: 'JWT_SECRET',
                valueFrom: input.jwtSecretParamArn,
              },
              ...input.secretEnvVars,
            ],
            logConfiguration: {
              logDriver: 'awslogs',
              options: {
                'awslogs-group': `/ecs/${input.containerName}`,
                'awslogs-create-group': 'true',
                'awslogs-region': input.awsRegion,
                'awslogs-stream-prefix': 'ecs',
              },
            },
          },
        ],
      }),
    );

    const taskDefinitionArn =
      taskDefinitionResult.taskDefinition?.taskDefinitionArn;

    if (!taskDefinitionArn) {
      throw new Error('ECS task definition registration did not return an ARN');
    }

    return taskDefinitionArn;
  }

  private buildProjectSecretParamName(projectId: string, key: string) {
    const projectName = process.env.PROJECT_NAME ?? 'kereo-v2';
    return `/${projectName}/prod/apps/${projectId}/env/${key}`;
  }

  private async putProjectSecretParameters(
    ssmClient: SSMClient,
    input: {
      projectId: string;
      envVars: Array<{
        key: string;
        value: string;
        isSecret: boolean;
      }>;
    },
  ) {
    const secretEnvVars = input.envVars.filter((envVar) => envVar.isSecret);
    const awsRegion = process.env.AWS_REGION;
    const awsAccountId = process.env.AWS_ACCOUNT_ID;

    if (!awsRegion || !awsAccountId) {
      throw new Error(
        'Missing AWS region/account configuration for project secret parameters',
      );
    }

    const results: Array<{ name: string; valueFrom: string }> = [];

    for (const envVar of secretEnvVars) {
      const parameterName = this.buildProjectSecretParamName(
        input.projectId,
        envVar.key,
      );
      await this.putProjectDatabaseUrlParameter(ssmClient, {
        parameterName,
        databaseUrl: envVar.value,
      });
      results.push({
        name: envVar.key,
        valueFrom: this.buildParameterArn({
          awsRegion,
          awsAccountId,
          parameterName,
        }),
      });
    }

    return results;
  }

  private async createEcsService(
    ecsClient: ECSClient,
    input: {
      cluster: string;
      serviceName: string;
      taskDefinitionArn: string;
      subnetIds: string[];
      securityGroupIds: string[];
      targetGroupArn: string;
      containerName: string;
      containerPort: number;
    },
  ) {
    await ecsClient.send(
      new CreateServiceCommand({
        cluster: input.cluster,
        serviceName: input.serviceName,
        taskDefinition: input.taskDefinitionArn,
        desiredCount: 1,
        launchType: 'FARGATE',
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: 'ENABLED',
            subnets: input.subnetIds,
            securityGroups: input.securityGroupIds,
          },
        },
        loadBalancers: [
          {
            targetGroupArn: input.targetGroupArn,
            containerName: input.containerName,
            containerPort: input.containerPort,
          },
        ],
      }),
    );
  }

  private async updateEcsService(
    ecsClient: ECSClient,
    input: {
      cluster: string;
      serviceName: string;
      taskDefinitionArn: string;
    },
  ) {
    await ecsClient.send(
      new UpdateServiceCommand({
        cluster: input.cluster,
        service: input.serviceName,
        taskDefinition: input.taskDefinitionArn,
        forceNewDeployment: true,
      }),
    );
  }

  private async ecsServiceExists(
    ecsClient: ECSClient,
    input: {
      cluster: string;
      serviceName: string;
    },
  ) {
    const serviceDetails = await ecsClient.send(
      new DescribeServicesCommand({
        cluster: input.cluster,
        services: [input.serviceName],
      }),
    );

    const service = serviceDetails.services?.[0];
    return Boolean(service && service.status !== 'INACTIVE');
  }
}
