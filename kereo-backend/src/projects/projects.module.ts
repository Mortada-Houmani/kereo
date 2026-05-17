import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectEnvVar } from './entities/project-env-var.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { AwsModule } from '../aws/aws.module';
import { GithubModule } from '../github/github.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectEnvVar]),
    AwsModule,
    GithubModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
