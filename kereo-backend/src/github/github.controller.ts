import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GithubService } from './github.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { VerifiedEmailGuard } from '../auth/verified-email.guard';

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

  @Get('connection')
  getCurrentConnection(@Req() req: AuthenticatedRequest) {
    return this.githubService.getCurrentConnection(req.user);
  }

  @UseGuards(VerifiedEmailGuard)
  @Get('installations')
  listInstallations(@Req() req: AuthenticatedRequest) {
    return this.githubService.listInstallationsForUser(
      req.user.githubAccessToken ?? '',
    );
  }

  @UseGuards(VerifiedEmailGuard)
  @Get('installations/:installationId/repositories')
  listRepositories(
    @Param('installationId') installationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.githubService.listRepositoriesForUser(
      req.user.githubAccessToken ?? '',
      installationId,
    );
  }

  @UseGuards(VerifiedEmailGuard)
  @Get('installations/:installationId/repositories/:owner/:repo/branches')
  listBranches(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.githubService.listBranchesForUser(
      req.user.githubAccessToken ?? '',
      `${owner}/${repo}`,
    );
  }
}
