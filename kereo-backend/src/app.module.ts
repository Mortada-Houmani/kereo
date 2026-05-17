import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksModule } from './webhooks/webhooks.module';
import { GithubModule } from './github/github.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseSchemaService } from './database-schema.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: (() => {
          const host = config.get<string>('REDIS_HOST') || 'localhost';
          const port = parseInt(config.get<string>('REDIS_PORT') || '6379', 10);

          console.log(`BullMQ Redis connection: ${host}:${port}`);

          return {
            host,
            port,
          };
        })(),
      }),
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        const synchronize =
          config.get<string>('TYPEORM_SYNCHRONIZE') === 'true' ||
          (!databaseUrl && config.get<string>('NODE_ENV') !== 'production');

        return {
          type: 'postgres',
          ...(databaseUrl
            ? {
                url: databaseUrl,
                ssl: {
                  rejectUnauthorized: false,
                },
              }
            : {
                host: config.get<string>('DATABASE_HOST'),
                port: config.get<number>('DATABASE_PORT'),
                username: config.get<string>('DATABASE_USER'),
                password: config.get<string>('DATABASE_PASSWORD'),
                database: config.get<string>('DATABASE_NAME'),
              }),
          autoLoadEntities: true,
          synchronize,
        };
      },
    }),

    UsersModule,
    AuthModule,
    ProjectsModule,
    DeploymentsModule,
    GithubModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseSchemaService],
})
export class AppModule {}
