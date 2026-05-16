import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { AwsModule } from '../aws/aws.module';

@Module({
  imports: [TypeOrmModule.forFeature([Project]), AwsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
