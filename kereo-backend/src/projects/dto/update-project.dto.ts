import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { ProjectRuntimeType } from '../entities/project.entity';

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsString()
  @IsOptional()
  dockerfilePath?: string;

  @IsString()
  @IsOptional()
  buildContext?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  port?: number;

  @IsIn(Object.values(ProjectRuntimeType))
  @IsOptional()
  runtimeType?: ProjectRuntimeType;

  @Matches(/^\//, {
    message: 'healthCheckPath must start with "/"',
  })
  @IsOptional()
  healthCheckPath?: string;

  @IsOptional()
  githubInstallationId?: string | null;

  @IsOptional()
  githubRepositoryId?: string | null;

  @IsString()
  @IsOptional()
  githubRepositoryFullName?: string | null;

  @IsString()
  @IsOptional()
  githubDefaultBranch?: string | null;
}
