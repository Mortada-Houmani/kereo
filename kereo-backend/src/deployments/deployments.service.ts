import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  Deployment,
  DeploymentPhase,
  DeploymentStatus,
} from './entities/deployment.entity';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class DeploymentsService {
  constructor(
    @InjectRepository(Deployment)
    private readonly deploymentsRepository: Repository<Deployment>,
    private readonly projectsService: ProjectsService,
    @InjectQueue('deployments')
    private readonly deploymentsQueue: Queue,
  ) {}

  async create(
    projectId: string,
    userId: string,
    options?: {
      commitSha?: string;
      triggerLog?: string;
    },
  ) {
    const project = await this.projectsService.findOwnedProjectEntity(
      projectId,
      userId,
      true,
    );
    const projectDashboard = await this.projectsService.findOne(
      projectId,
      userId,
    );

    if (!projectDashboard.deployConfigValid) {
      throw new BadRequestException(
        `Deployment configuration is incomplete: ${projectDashboard.deployConfigErrors.join(' ')}`,
      );
    }

    const deployment = this.deploymentsRepository.create({
      status: DeploymentStatus.QUEUED,
      phase: DeploymentPhase.QUEUED,
      phaseLabel: 'Queued',
      project,
      commitSha: options?.commitSha,
      logs: `Deployment queued...\n${options?.triggerLog ?? ''}`,
    });

    const savedDeployment = await this.deploymentsRepository.save(deployment);

    const job = await this.deploymentsQueue.add(
      'deploy',
      {
        deploymentId: savedDeployment.id,
      },
      {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    console.log('Deployment job enqueued:', job.id, job.name, job.data);

    return savedDeployment;
  }

  async findByProject(projectId: string, userId: string) {
    await this.projectsService.findOne(projectId, userId);

    return this.deploymentsRepository.find({
      where: {
        project: {
          id: projectId,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string, userId: string) {
    const deployment = await this.deploymentsRepository.findOne({
      where: {
        id,
        project: {
          user: {
            id: userId,
          },
        },
      },
      relations: ['project'],
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    return deployment;
  }
}
