import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { DeleteParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Client } from 'pg';

import { Project } from './entities/project.entity';
import {
  ProjectDatabaseMode,
  ProjectRuntimeType,
} from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpsertProjectEnvVarDto } from './dto/upsert-project-env-var.dto';
import { AwsProvisioningService } from '../aws/aws-provisioning.service';
import { GithubService } from '../github/github.service';
import {
  Deployment,
  DeploymentPhase,
  DeploymentStatus,
} from '../deployments/entities/deployment.entity';
import { ProjectEnvVar } from './entities/project-env-var.entity';
import { UsersService } from '../users/users.service';

type DeploymentSummary = {
  id: string;
  status: DeploymentStatus;
  phase: DeploymentPhase;
  phaseLabel: string | null;
  commitSha: string | null;
  imageUrl: string | null;
  liveUrl: string | null;
  codebuildBuildId: string | null;
  codebuildStatus: string | null;
  taskDefinitionArn: string | null;
  databaseName: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  durationMs: number;
  isActive: boolean;
  isTerminal: boolean;
};

type ProjectDashboard = Omit<Project, 'deployments' | 'envVars'> & {
  latestDeployment: DeploymentSummary | null;
  deployments: DeploymentSummary[];
  envVars: Array<{
    id: string;
    key: string;
    isSecret: boolean;
    hasValue: boolean;
    updatedAt: Date;
  }>;
  deployConfigValid: boolean;
  deployConfigErrors: string[];
  requiresRedeploy: boolean;
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(ProjectEnvVar)
    private readonly projectEnvVarsRepository: Repository<ProjectEnvVar>,
    private readonly awsProvisioningService: AwsProvisioningService,
    private readonly githubService: GithubService,
    private readonly usersService: UsersService,
  ) {}

  async create(createProjectDto: CreateProjectDto, userId: string) {
    const runtimeType =
      createProjectDto.runtimeType ?? ProjectRuntimeType.WEB_SERVER;
    const databaseMode =
      createProjectDto.databaseMode ??
      (runtimeType === ProjectRuntimeType.STATIC_SITE
        ? ProjectDatabaseMode.NONE
        : ProjectDatabaseMode.MANAGED_POSTGRES);
    const healthCheckPath = createProjectDto.healthCheckPath ?? '/';
    const port =
      createProjectDto.port ??
      (runtimeType === ProjectRuntimeType.STATIC_SITE ? 80 : 3000);
    const slug = await this.generateUniqueSlug(createProjectDto.name);
    const resourceName = this.buildProjectResourceName(slug);

    const repoBinding = this.normalizeGithubBinding(createProjectDto);

    if (
      repoBinding.githubInstallationId &&
      repoBinding.githubRepositoryFullName
    ) {
      await this.assertUserCanAccessGithubBinding(userId, repoBinding);
      await this.githubService.verifyRepositoryAccess(
        repoBinding.githubInstallationId,
        repoBinding.githubRepositoryFullName,
      );
    }

    const project = this.projectsRepository.create({
      ...createProjectDto,
      repoUrl: repoBinding.repoUrl,
      branch:
        createProjectDto.branch ?? repoBinding.githubDefaultBranch ?? 'main',
      runtimeType,
      databaseMode,
      healthCheckPath,
      port,
      slug,
      ecsServiceName: `${resourceName}-service`,
      ecsTaskFamily: resourceName,
      githubInstallationId: repoBinding.githubInstallationId,
      githubRepositoryId: repoBinding.githubRepositoryId,
      githubRepositoryFullName: repoBinding.githubRepositoryFullName,
      githubDefaultBranch: repoBinding.githubDefaultBranch,
      user: {
        id: userId,
      },
    });

    const savedProject = await this.projectsRepository.save(project);
    await this.syncExternalDatabaseUrl(savedProject, {
      databaseMode,
      externalDatabaseUrl: createProjectDto.externalDatabaseUrl,
    });

    try {
      const provisioningResult =
        await this.awsProvisioningService.provisionProject({
          slug,
          port: savedProject.port,
          healthCheckPath: savedProject.healthCheckPath,
        });

      savedProject.targetGroupArn = provisioningResult.targetGroupArn;
      savedProject.listenerRuleArn = provisioningResult.listenerRuleArn;
      savedProject.ecsSecurityGroupId = provisioningResult.ecsSecurityGroupId;
      savedProject.publicUrl = provisioningResult.publicUrl;
      await this.projectsRepository.save(savedProject);

      const hydratedProject = await this.projectsRepository.findOneOrFail({
        where: { id: savedProject.id },
        relations: ['deployments', 'envVars'],
      });

      return this.toProjectDashboard(hydratedProject);
    } catch (error) {
      this.logger.error(
        `Deleting project ${savedProject.id} after AWS provisioning failure`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.projectsRepository.remove(savedProject);

      throw new InternalServerErrorException(
        error instanceof Error
          ? `AWS provisioning failed: ${error.message}`
          : 'AWS provisioning failed',
      );
    }
  }

  findAll(userId: string) {
    return this.projectsRepository
      .find({
        where: {
          user: {
            id: userId,
          },
        },
        relations: ['deployments', 'envVars'],
        order: {
          createdAt: 'DESC',
        },
      })
      .then((projects) =>
        projects.map((project) => this.toProjectDashboard(project)),
      );
  }

  async findOne(id: string, userId: string) {
    const project = await this.findOwnedProjectEntity(id, userId, true);
    return this.toProjectDashboard(project);
  }

  async update(id: string, userId: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.findOwnedProjectEntity(id, userId, true);
    const repoBinding = this.normalizeGithubBinding(updateProjectDto, project);

    if (
      repoBinding.githubInstallationId &&
      repoBinding.githubRepositoryFullName
    ) {
      await this.assertUserCanAccessGithubBinding(userId, repoBinding);
      await this.githubService.verifyRepositoryAccess(
        repoBinding.githubInstallationId,
        repoBinding.githubRepositoryFullName,
      );
    }

    if (updateProjectDto.runtimeType) {
      project.runtimeType = updateProjectDto.runtimeType;
    }

    if (updateProjectDto.databaseMode !== undefined) {
      project.databaseMode = updateProjectDto.databaseMode;
    }

    if (updateProjectDto.name !== undefined) {
      project.name = updateProjectDto.name;
    }

    if (updateProjectDto.branch !== undefined) {
      project.branch = updateProjectDto.branch;
    }

    if (updateProjectDto.dockerfilePath !== undefined) {
      project.dockerfilePath = updateProjectDto.dockerfilePath;
    }

    if (updateProjectDto.buildContext !== undefined) {
      project.buildContext = updateProjectDto.buildContext;
    }

    if (updateProjectDto.port !== undefined) {
      project.port = updateProjectDto.port;
    }

    if (updateProjectDto.healthCheckPath !== undefined) {
      project.healthCheckPath = updateProjectDto.healthCheckPath;
    }

    project.repoUrl = repoBinding.repoUrl;
    project.githubInstallationId = repoBinding.githubInstallationId;
    project.githubRepositoryId = repoBinding.githubRepositoryId;
    project.githubRepositoryFullName = repoBinding.githubRepositoryFullName;
    project.githubDefaultBranch = repoBinding.githubDefaultBranch;

    const savedProject = await this.projectsRepository.save(project);
    await this.syncExternalDatabaseUrl(savedProject, {
      databaseMode: project.databaseMode,
      externalDatabaseUrl: updateProjectDto.externalDatabaseUrl,
    });
    const hydratedProject = await this.findOwnedProjectEntity(
      savedProject.id,
      userId,
      true,
    );
    return this.toProjectDashboard(hydratedProject);
  }

  async remove(id: string, userId: string) {
    const project = await this.findOwnedProjectEntity(id, userId, true);
    const projectSnapshot = this.projectsRepository.create({
      ...project,
    });

    await this.projectsRepository.remove(project);
    void this.cleanupDeletedProjectResources(projectSnapshot);

    return {
      message: 'Project deletion started',
    };
  }

  async listEnvVars(id: string, userId: string) {
    const project = await this.findOwnedProjectEntity(id, userId, true);
    return this.toProjectDashboard(project).envVars;
  }

  async upsertEnvVar(
    id: string,
    userId: string,
    input: UpsertProjectEnvVarDto,
    envVarId?: string,
  ) {
    const project = await this.findOwnedProjectEntity(id, userId, true);
    let envVar =
      envVarId === undefined
        ? await this.projectEnvVarsRepository.findOne({
            where: {
              project: { id: project.id },
              key: input.key,
            },
          })
        : await this.projectEnvVarsRepository.findOne({
            where: {
              id: envVarId,
              project: { id: project.id },
            },
          });

    if (!envVar) {
      envVar = this.projectEnvVarsRepository.create({
        key: input.key,
        value: input.value ?? '',
        isSecret: input.isSecret ?? false,
        project,
      });
    } else {
      envVar.key = input.key;
      if (input.value !== undefined) {
        envVar.value = input.value;
      }
      if (input.isSecret !== undefined) {
        envVar.isSecret = input.isSecret;
      }
    }

    await this.projectEnvVarsRepository.save(envVar);
    return this.listEnvVars(id, userId);
  }

  async removeEnvVar(id: string, envVarId: string, userId: string) {
    const project = await this.findOwnedProjectEntity(id, userId);
    const envVar = await this.projectEnvVarsRepository.findOne({
      where: {
        id: envVarId,
        project: { id: project.id },
      },
    });

    if (!envVar) {
      throw new NotFoundException('Environment variable not found');
    }

    await this.projectEnvVarsRepository.remove(envVar);
    return this.listEnvVars(id, userId);
  }

  private async cleanupDeletedProjectResources(project: Project) {
    try {
      await this.awsProvisioningService.deleteProjectResources({
        ecsServiceName: project.ecsServiceName,
        ecsTaskFamily: project.ecsTaskFamily,
        targetGroupArn: project.targetGroupArn,
        listenerRuleArn: project.listenerRuleArn,
        ecsSecurityGroupId: project.ecsSecurityGroupId,
      });
    } catch (error) {
      this.logger.error(
        `AWS cleanup failed for project ${project.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    try {
      await this.deleteProjectDataResources(project);
    } catch (error) {
      this.logger.error(
        `Project data cleanup failed for project ${project.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async generateUniqueSlug(name: string) {
    const baseSlug = name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const safeSlug = baseSlug || 'project';

    const slugExists = await this.projectsRepository.exists({
      where: {
        slug: safeSlug,
      },
    });

    if (!slugExists) {
      return safeSlug;
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 8);
      const slug = `${safeSlug}-${suffix}`;
      const exists = await this.projectsRepository.exists({
        where: {
          slug,
        },
      });

      if (!exists) {
        return slug;
      }
    }

    return `${safeSlug}-${Date.now().toString(36)}`;
  }

  private buildProjectResourceName(slug: string) {
    return slug.startsWith('kereo-') ? slug : `kereo-${slug}`;
  }

  private async deleteProjectDataResources(project: Project) {
    const awsRegion = process.env.AWS_REGION;
    const coreDatabaseUrl =
      process.env.DATABASE_URL || process.env.APP_DATABASE_URL;

    if (!awsRegion) {
      throw new Error('Missing AWS_REGION environment variable');
    }

    if (!coreDatabaseUrl) {
      throw new Error(
        'Missing DATABASE_URL environment variable (or APP_DATABASE_URL)',
      );
    }

    const databaseName = this.buildProjectDatabaseName(
      project.slug,
      project.id,
    );
    const parameterNames =
      project.databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES
        ? [this.buildProjectDatabaseParamName(project.id)]
        : [];
    const logGroupName = `/ecs/${project.slug}`;

    const envVars = await this.projectEnvVarsRepository.find({
      where: {
        project: { id: project.id },
      },
    });

    parameterNames.push(
      ...envVars
        .filter((envVar) => envVar.isSecret)
        .map((envVar) =>
          this.buildProjectSecretParamName(project.id, envVar.key),
        ),
    );

    if (project.databaseMode === ProjectDatabaseMode.MANAGED_POSTGRES) {
      await this.dropProjectDatabase(coreDatabaseUrl, databaseName);
    }
    for (const parameterName of parameterNames) {
      await this.deleteProjectDatabaseParameter(awsRegion, parameterName);
    }
    await this.deleteProjectLogGroup(awsRegion, logGroupName);
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

  private buildProjectDatabaseParamName(projectId: string) {
    const projectName = process.env.PROJECT_NAME ?? 'kereo-v2';
    return `/${projectName}/prod/apps/${projectId}/DATABASE_URL`;
  }

  private buildProjectSecretParamName(projectId: string, key: string) {
    const projectName = process.env.PROJECT_NAME ?? 'kereo-v2';
    return `/${projectName}/prod/apps/${projectId}/env/${key}`;
  }

  private async dropProjectDatabase(
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
      await adminClient.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [databaseName],
      );

      await adminClient.query(
        `DROP DATABASE IF EXISTS ${this.quoteIdentifier(databaseName)}`,
      );
    } finally {
      await adminClient.end();
    }
  }

  private async deleteProjectDatabaseParameter(
    awsRegion: string,
    parameterName: string,
  ) {
    const ssmClient = new SSMClient({ region: awsRegion });

    try {
      await ssmClient.send(
        new DeleteParameterCommand({
          Name: parameterName,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'ParameterNotFound'
      ) {
        return;
      }

      throw error;
    }
  }

  private async deleteProjectLogGroup(awsRegion: string, logGroupName: string) {
    const logsClient = new CloudWatchLogsClient({ region: awsRegion });

    try {
      await logsClient.send(
        new DeleteLogGroupCommand({
          logGroupName,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'name' in error &&
        error.name === 'ResourceNotFoundException'
      ) {
        return;
      }

      throw error;
    }
  }

  private quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  async findOwnedProjectEntity(
    id: string,
    userId: string,
    includeDeployments = false,
  ) {
    const project = await this.projectsRepository.findOne({
      where: {
        id,
        user: {
          id: userId,
        },
      },
      relations: includeDeployments ? ['deployments', 'envVars'] : ['envVars'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private toProjectDashboard(project: Project): ProjectDashboard {
    const deployments = [...(project.deployments ?? [])]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((deployment) => this.toDeploymentSummary(deployment));

    const { deployments: projectDeployments, ...projectFields } = project;
    void projectDeployments;

    const deployConfigErrors = this.getDeployConfigErrors(project);
    const latestDeployment = deployments[0] ?? null;
    const configUpdatedAt = [
      project.updatedAt.getTime(),
      ...(project.envVars ?? []).map((envVar) => envVar.updatedAt.getTime()),
    ].reduce((max, value) => Math.max(max, value), 0);

    return {
      ...projectFields,
      envVars: (project.envVars ?? [])
        .slice()
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((envVar) => ({
          id: envVar.id,
          key: envVar.key,
          isSecret: envVar.isSecret,
          hasValue: Boolean(envVar.value),
          updatedAt: envVar.updatedAt,
        })),
      latestDeployment,
      deployments,
      deployConfigValid: deployConfigErrors.length === 0,
      deployConfigErrors,
      requiresRedeploy:
        latestDeployment !== null &&
        configUpdatedAt > new Date(latestDeployment.createdAt).getTime(),
    };
  }

  async getProjectEnvVarValues(projectId: string) {
    return this.projectEnvVarsRepository.find({
      where: { project: { id: projectId } },
      select: {
        id: true,
        key: true,
        value: true,
        isSecret: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private getDeployConfigErrors(project: Project) {
    const errors: string[] = [];

    if (!project.repoUrl) {
      errors.push('Repository is not configured.');
    }

    if (!project.branch) {
      errors.push('Branch is not configured.');
    }

    if (!project.dockerfilePath) {
      errors.push('Dockerfile path is required.');
    }

    if (!project.buildContext) {
      errors.push('Build context is required.');
    }

    if (!project.healthCheckPath?.startsWith('/')) {
      errors.push('Health check path must start with "/".');
    }

    if (!project.port || project.port < 1) {
      errors.push('Port must be greater than 0.');
    }

    if (
      project.databaseMode === ProjectDatabaseMode.EXTERNAL_DATABASE_URL &&
      !(project.envVars ?? []).some(
        (envVar) => envVar.key === 'DATABASE_URL' && envVar.isSecret,
      )
    ) {
      errors.push(
        'External database mode requires a secret DATABASE_URL environment variable.',
      );
    }

    if (
      project.githubInstallationId &&
      (!project.githubRepositoryFullName || !project.githubRepositoryId)
    ) {
      errors.push(
        'GitHub installation is connected but repository binding is incomplete.',
      );
    }

    return errors;
  }

  private normalizeGithubBinding(
    input:
      | CreateProjectDto
      | UpdateProjectDto
      | (CreateProjectDto & UpdateProjectDto),
    existingProject?: Project,
  ) {
    const githubInstallationId =
      input.githubInstallationId ??
      existingProject?.githubInstallationId ??
      null;
    const githubRepositoryId =
      input.githubRepositoryId ?? existingProject?.githubRepositoryId ?? null;
    const githubRepositoryFullName =
      input.githubRepositoryFullName ??
      existingProject?.githubRepositoryFullName ??
      null;
    const githubDefaultBranch =
      input.githubDefaultBranch ?? existingProject?.githubDefaultBranch ?? null;
    const repoUrl =
      input.repoUrl ??
      (githubRepositoryFullName
        ? `https://github.com/${githubRepositoryFullName}.git`
        : (existingProject?.repoUrl ?? ''));

    return {
      githubInstallationId,
      githubRepositoryId,
      githubRepositoryFullName,
      githubDefaultBranch,
      repoUrl,
    };
  }

  private async assertUserCanAccessGithubBinding(
    userId: string,
    repoBinding: {
      githubInstallationId: string | null;
      githubRepositoryFullName: string | null;
    },
  ) {
    if (
      !repoBinding.githubInstallationId ||
      !repoBinding.githubRepositoryFullName
    ) {
      return;
    }

    const user = await this.usersService.findById(userId);

    if (!user?.githubAccessToken) {
      throw new ForbiddenException(
        'Connect GitHub before binding a repository to this project',
      );
    }

    const repositories = await this.githubService.listRepositoriesForUser(
      user.githubAccessToken,
      repoBinding.githubInstallationId,
    );
    const canAccessRepository = repositories.some(
      (repository) =>
        repository.fullName.toLowerCase() ===
        repoBinding.githubRepositoryFullName?.toLowerCase(),
    );

    if (!canAccessRepository) {
      throw new ForbiddenException(
        'You do not have access to the selected GitHub repository',
      );
    }
  }

  private async syncExternalDatabaseUrl(
    project: Project,
    input: {
      databaseMode: ProjectDatabaseMode;
      externalDatabaseUrl?: string;
    },
  ) {
    const existingDatabaseUrlEnv = await this.projectEnvVarsRepository.findOne({
      where: {
        project: { id: project.id },
        key: 'DATABASE_URL',
      },
    });

    if (input.databaseMode === ProjectDatabaseMode.EXTERNAL_DATABASE_URL) {
      if (input.externalDatabaseUrl) {
        const envVar =
          existingDatabaseUrlEnv ??
          this.projectEnvVarsRepository.create({
            key: 'DATABASE_URL',
            value: input.externalDatabaseUrl,
            isSecret: true,
            project,
          });

        envVar.key = 'DATABASE_URL';
        envVar.value = input.externalDatabaseUrl;
        envVar.isSecret = true;
        envVar.project = project;
        await this.projectEnvVarsRepository.save(envVar);
        return;
      }

      if (!existingDatabaseUrlEnv) {
        throw new ForbiddenException(
          'External database mode requires an external database URL',
        );
      }

      existingDatabaseUrlEnv.key = 'DATABASE_URL';
      existingDatabaseUrlEnv.isSecret = true;
      await this.projectEnvVarsRepository.save(existingDatabaseUrlEnv);
      return;
    }

    if (
      existingDatabaseUrlEnv &&
      existingDatabaseUrlEnv.isSecret &&
      existingDatabaseUrlEnv.key === 'DATABASE_URL'
    ) {
      await this.projectEnvVarsRepository.remove(existingDatabaseUrlEnv);
    }
  }

  private toDeploymentSummary(deployment: Deployment): DeploymentSummary {
    const durationMs =
      deployment.updatedAt.getTime() - deployment.createdAt.getTime();
    const isTerminal =
      deployment.status === DeploymentStatus.SUCCESS ||
      deployment.status === DeploymentStatus.FAILED;

    return {
      id: deployment.id,
      status: deployment.status,
      phase: deployment.phase,
      phaseLabel: deployment.phaseLabel ?? null,
      commitSha: deployment.commitSha ?? null,
      imageUrl: deployment.imageUrl ?? null,
      liveUrl: deployment.liveUrl ?? null,
      codebuildBuildId: deployment.codebuildBuildId ?? null,
      codebuildStatus: deployment.codebuildStatus ?? null,
      taskDefinitionArn: deployment.taskDefinitionArn ?? null,
      databaseName: deployment.databaseName ?? null,
      errorMessage: deployment.errorMessage ?? null,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
      durationMs: Math.max(durationMs, 0),
      isActive: !isTerminal,
      isTerminal,
    };
  }
}
