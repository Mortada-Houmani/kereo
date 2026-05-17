import { Module } from '@nestjs/common';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';

@Module({
  controllers: [GithubController],
  providers: [GithubService, VerifiedEmailGuard],
  exports: [GithubService],
})
export class GithubModule {}
