import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeploymentsModule } from '../deployments/deployments.module';
import { Project } from '../projects/entities/project.entity';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project]), DeploymentsModule],
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService],
})
export class WebhooksModule {}
