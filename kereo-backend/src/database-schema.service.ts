import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseSchemaService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    await this.ensureDeploymentDashboardColumns();
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
}
