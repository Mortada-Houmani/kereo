import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.ensureDeploymentDashboardColumns();
    await this.ensureProjectRuntimeColumns();
    await this.ensureProjectGithubColumns();
    await this.ensureProjectEnvVarTable();
    await this.ensureUserAuthColumns();
  }

  private async ensureDeploymentDashboardColumns() {
    await this.dataSource.query(`
      ALTER TABLE deployments
        ADD COLUMN IF NOT EXISTS phase varchar NOT NULL DEFAULT 'queued',
        ADD COLUMN IF NOT EXISTS "phaseLabel" varchar,
        ADD COLUMN IF NOT EXISTS "codebuildBuildId" varchar,
        ADD COLUMN IF NOT EXISTS "codebuildStatus" varchar,
        ADD COLUMN IF NOT EXISTS "taskDefinitionArn" varchar,
        ADD COLUMN IF NOT EXISTS "databaseName" varchar
    `);

    this.logger.log('Deployment dashboard schema is ready');
  }

  private async ensureProjectRuntimeColumns() {
    await this.dataSource.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS "runtimeType" varchar NOT NULL DEFAULT 'web-server',
        ADD COLUMN IF NOT EXISTS "healthCheckPath" varchar NOT NULL DEFAULT '/',
        ADD COLUMN IF NOT EXISTS "ecsSecurityGroupId" varchar
    `);

    await this.dataSource.query(`
      UPDATE projects
      SET "runtimeType" = COALESCE(NULLIF("runtimeType", ''), 'web-server'),
          "healthCheckPath" = COALESCE(NULLIF("healthCheckPath", ''), '/')
    `);

    this.logger.log('Project runtime schema is ready');
  }

  private async ensureProjectGithubColumns() {
    await this.dataSource.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS "githubInstallationId" bigint,
        ADD COLUMN IF NOT EXISTS "githubRepositoryId" bigint,
        ADD COLUMN IF NOT EXISTS "githubRepositoryFullName" varchar,
        ADD COLUMN IF NOT EXISTS "githubDefaultBranch" varchar
    `);

    this.logger.log('Project GitHub schema is ready');
  }

  private async ensureProjectEnvVarTable() {
    await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS project_env_vars (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key varchar NOT NULL,
        value text NOT NULL DEFAULT '',
        "isSecret" boolean NOT NULL DEFAULT false,
        "projectId" uuid REFERENCES projects(id) ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS "IDX_project_env_vars_projectId"
      ON project_env_vars ("projectId")
    `);

    this.logger.log('Project env var schema is ready');
  }

  private async ensureUserAuthColumns() {
    await this.dataSource.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "isEmailVerified" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "emailVerificationTokenHash" varchar,
        ADD COLUMN IF NOT EXISTS "emailVerificationExpiresAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "githubUserId" varchar,
        ADD COLUMN IF NOT EXISTS "githubLogin" varchar,
        ADD COLUMN IF NOT EXISTS "githubAvatarUrl" varchar,
        ADD COLUMN IF NOT EXISTS "githubAccessToken" text
    `);

    await this.dataSource.query(`
      ALTER TABLE users
      ALTER COLUMN password DROP NOT NULL
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_githubUserId"
      ON users ("githubUserId")
      WHERE "githubUserId" IS NOT NULL
    `);

    this.logger.log('User auth schema is ready');
  }
}
