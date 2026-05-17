import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectEnvVar } from './entities/project-env-var.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { AwsModule } from '../aws/aws.module';
import { GithubModule } from '../github/github.module';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectEnvVar]),
    AwsModule,
    GithubModule,
    UsersModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, VerifiedEmailGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
