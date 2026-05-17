import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GithubService } from './github.service';

@UseGuards(JwtAuthGuard)
@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('app')
  getAppConfig() {
    return {
      installUrl: this.githubService.getInstallationUrl(),
    };
  }

  @Get('installations')
  listInstallations() {
    return this.githubService.listInstallations();
  }

  @Get('installations/:installationId/repositories')
  listRepositories(@Param('installationId') installationId: string) {
    return this.githubService.listRepositories(installationId);
  }

  @Get('installations/:installationId/repositories/:owner/:repo/branches')
  listBranches(
    @Param('installationId') installationId: string,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    return this.githubService.listBranches(installationId, `${owner}/${repo}`);
  }
}
