import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Project } from '../projects/entities/project.entity';
import { DeploymentsService } from '../deployments/deployments.service';

type GitHubPushPayload = {
  ref?: string;
  after?: string;
  installation?: {
    id?: number;
  };
  pusher?: {
    name?: string;
  };
  repository?: {
    id?: number;
    full_name?: string;
  };
};

@Injectable()
export class GithubWebhookService implements OnModuleInit {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    private readonly deploymentsService: DeploymentsService,
  ) {}

  onModuleInit() {
    if (!process.env.GITHUB_WEBHOOK_SECRET) {
      throw new Error('Missing GITHUB_WEBHOOK_SECRET environment variable');
    }
  }

  async handleGithubWebhook(input: {
    event: string | undefined;
    deliveryId: string | undefined;
    signature: string | undefined;
    rawBody: Buffer | undefined;
    payload: GitHubPushPayload;
  }) {
    console.log('Received GitHub webhook:', input.deliveryId);
    console.log('GitHub webhook event type:', input.event);

    this.verifySignature(input.signature, input.rawBody);
    console.log('GitHub webhook signature verified:', input.deliveryId);

    if (input.event !== 'push') {
      console.log('Ignoring GitHub webhook event:', input.event);
      return { ignored: true };
    }

    const repositoryFullName = input.payload.repository?.full_name;
    const repositoryId = input.payload.repository?.id;
    const installationId = input.payload.installation?.id;
    const branch = this.refToBranch(input.payload.ref);
    const commitSha = input.payload.after;
    const pusherName = input.payload.pusher?.name;

    console.log('GitHub webhook repository:', repositoryFullName);
    console.log('GitHub webhook branch:', branch);

    if (!repositoryFullName || !branch) {
      console.log('Ignoring GitHub webhook: missing repository or branch');
      return {
        ignored: true,
        reason: 'Missing repository or branch',
      };
    }

    const project = await this.findMatchingProject({
      repositoryFullName,
      repositoryId: repositoryId ? String(repositoryId) : undefined,
      installationId: installationId ? String(installationId) : undefined,
      branch,
    });

    if (!project || !project.user?.id) {
      console.log(
        `No matching project for GitHub webhook repo=${repositoryFullName} branch=${branch}`,
      );

      return {
        ignored: true,
        reason: 'No matching project',
      };
    }

    console.log('GitHub webhook matching project id:', project.id);

    const deployment = await this.deploymentsService.create(
      project.id,
      project.user.id,
      {
        commitSha,
        triggerLog: [
          'Deployment triggered by GitHub push.',
          `GitHub delivery: ${input.deliveryId ?? 'unknown'}`,
          `Repository: ${repositoryFullName}`,
          `Branch: ${branch}`,
          `Commit: ${commitSha ?? 'unknown'}`,
          `Pusher: ${pusherName ?? 'unknown'}`,
          '',
        ].join('\n'),
      },
    );

    console.log('GitHub webhook deployment id:', deployment.id);

    return {
      accepted: true,
      deploymentId: deployment.id,
      projectId: project.id,
    };
  }

  private verifySignature(signature: string | undefined, rawBody?: Buffer) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!secret || !signature || !rawBody) {
      console.log('GitHub webhook signature rejected: missing input');
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }

    if (!signature.startsWith('sha256=')) {
      console.log('GitHub webhook signature rejected: unsupported format');
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }

    const expectedSignature = `sha256=${createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedSignatureBuffer.length) {
      console.log('GitHub webhook signature rejected: length mismatch');
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }

    if (!timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) {
      console.log('GitHub webhook signature rejected: digest mismatch');
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }
  }

  private refToBranch(ref?: string) {
    const prefix = 'refs/heads/';

    if (!ref?.startsWith(prefix)) {
      return undefined;
    }

    return ref.slice(prefix.length);
  }

  private async findMatchingProject(input: {
    repositoryFullName: string;
    repositoryId?: string;
    installationId?: string;
    branch: string;
  }) {
    const projects = await this.projectsRepository.find({
      where: {
        branch: input.branch,
      },
      relations: ['user'],
    });

    const normalizedRepositoryFullName = input.repositoryFullName.toLowerCase();

    console.log(
      `Checking ${projects.length} project(s) on branch ${input.branch} for repo ${normalizedRepositoryFullName}`,
    );

    return (
      projects.find(
        (project) =>
          project.githubInstallationId === input.installationId &&
          project.githubRepositoryId === input.repositoryId,
      ) ??
      projects.find(
        (project) =>
          project.githubRepositoryFullName?.toLowerCase() ===
          normalizedRepositoryFullName,
      ) ??
      projects.find(
        (project) =>
          this.repoUrlToFullName(project.repoUrl) ===
          normalizedRepositoryFullName,
      )
    );
  }

  private repoUrlToFullName(repoUrl: string) {
    const normalizedRepoUrl = repoUrl.trim().replace(/\.git$/i, '');
    const match = normalizedRepoUrl.match(/github\.com[:/](.+\/.+)$/i);

    return match?.[1]?.toLowerCase();
  }
}
