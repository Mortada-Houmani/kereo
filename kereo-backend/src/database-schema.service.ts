import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.ensureDeploymentDashboardColumns();
    await this.ensureProjectRuntimeColumns();
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
        ADD COLUMN IF NOT EXISTS "healthCheckPath" varchar NOT NULL DEFAULT '/'
    `);

    await this.dataSource.query(`
      UPDATE projects
      SET "runtimeType" = COALESCE(NULLIF("runtimeType", ''), 'web-server'),
          "healthCheckPath" = COALESCE(NULLIF("healthCheckPath", ''), '/')
    `);

    this.logger.log('Project runtime schema is ready');
  }
}
