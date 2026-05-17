import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpsertProjectEnvVarDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z_][A-Z0-9_]*$/, {
    message:
      'key must start with a letter or underscore and contain only uppercase letters, numbers, and underscores',
  })
  key: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsBoolean()
  @IsOptional()
  isSecret?: boolean;
}
