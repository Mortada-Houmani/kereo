import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeploymentsProcessor } from './processors/deployments.processor';
import { Deployment } from './entities/deployment.entity';
import { DeploymentsService } from './deployments.service';
import { DeploymentsController } from './deployments.controller';
import { ProjectsModule } from '../projects/projects.module';
import { BullModule } from '@nestjs/bullmq';
import { GithubModule } from '../github/github.module';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deployment]),
    BullModule.registerQueue({
      name: 'deployments',
    }),
    ProjectsModule,
    GithubModule,
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentsProcessor, VerifiedEmailGuard],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
