import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Min,
} from 'class-validator';
import { ProjectRuntimeType } from '../entities/project.entity';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsUrl()
  repoUrl: string;

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
}
