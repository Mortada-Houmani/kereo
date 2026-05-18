import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
} from 'class-validator';
import {
  ProjectDatabaseMode,
  ProjectRuntimeType,
} from '../entities/project.entity';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsUrl()
  repoUrl?: string;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  dockerfilePath?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  port?: number;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(ProjectRuntimeType))
  runtimeType?: ProjectRuntimeType;

  @IsOptional()
  @IsString()
  @Matches(/^\//, {
    message: 'healthCheckPath must start with "/"',
  })
  healthCheckPath?: string;

  @IsOptional()
  @IsString()
  buildContext?: string;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(ProjectDatabaseMode))
  databaseMode?: ProjectDatabaseMode;

  @IsOptional()
  @IsString()
  externalDatabaseUrl?: string;

  @IsOptional()
  @IsString()
  githubInstallationId?: string;

  @IsOptional()
  @IsString()
  githubRepositoryId?: string;

  @IsOptional()
  @IsString()
  githubRepositoryFullName?: string;

  @IsOptional()
  @IsString()
  githubDefaultBranch?: string;
}
