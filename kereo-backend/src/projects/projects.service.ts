import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
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
import { ProjectRuntimeType } from './entities/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { AwsProvisioningService } from '../aws/aws-provisioning.service';
import {
  Deployment,
  DeploymentPhase,
  DeploymentStatus,
} from '../deployments/entities/deployment.entity';

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

type ProjectDashboard = Omit<Project, 'deployments'> & {
  latestDeployment: DeploymentSummary | null;
  deployments: DeploymentSummary[];
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    private readonly awsProvisioningService: AwsProvisioningService,
  ) {}

  async create(createProjectDto: CreateProjectDto, userId: string) {
    const runtimeType =
      createProjectDto.runtimeType ?? ProjectRuntimeType.WEB_SERVER;
    const healthCheckPath = createProjectDto.healthCheckPath ?? '/';
    const port =
      createProjectDto.port ??
      (runtimeType === ProjectRuntimeType.STATIC_SITE ? 80 : 3000);
    const slug = await this.generateUniqueSlug(createProjectDto.name);
    const resourceName = this.buildProjectResourceName(slug);

    const project = this.projectsRepository.create({
      ...createProjectDto,
      runtimeType,
      healthCheckPath,
      port,
      slug,
      ecsServiceName: `${resourceName}-service`,
      ecsTaskFamily: resourceName,
      user: {
        id: userId,
      },
    });

    const savedProject = await this.projectsRepository.save(project);

    try {
      const provisioningResult =
        await this.awsProvisioningService.provisionProject({
          slug,
          port: savedProject.port,
          healthCheckPath: savedProject.healthCheckPath,
        });

      savedProject.targetGroupArn = provisioningResult.targetGroupArn;
      savedProject.listenerRuleArn = provisioningResult.listenerRuleArn;
      savedProject.publicUrl = provisioningResult.publicUrl;
      await this.projectsRepository.save(savedProject);

      const hydratedProject = await this.projectsRepository.findOneOrFail({
        where: { id: savedProject.id },
        relations: ['deployments'],
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
        relations: ['deployments'],
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

  async remove(id: string, userId: string) {
    const project = await this.findOwnedProjectEntity(id, userId);
    const projectSnapshot = this.projectsRepository.create({
      ...project,
    });

    await this.projectsRepository.remove(project);
    void this.cleanupDeletedProjectResources(projectSnapshot);

    return {
      message: 'Project deletion started',
    };
  }

  private async cleanupDeletedProjectResources(project: Project) {
    try {
      await this.awsProvisioningService.deleteProjectResources({
        ecsServiceName: project.ecsServiceName,
        ecsTaskFamily: project.ecsTaskFamily,
        targetGroupArn: project.targetGroupArn,
        listenerRuleArn: project.listenerRuleArn,
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
    const parameterName = this.buildProjectDatabaseParamName(project.id);
    const logGroupName = `/ecs/${project.slug}`;

    await this.dropProjectDatabase(coreDatabaseUrl, databaseName);
    await this.deleteProjectDatabaseParameter(awsRegion, parameterName);
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
      relations: includeDeployments ? ['deployments'] : [],
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

    return {
      ...projectFields,
      latestDeployment: deployments[0] ?? null,
      deployments,
    };
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
