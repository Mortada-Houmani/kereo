import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createPrivateKey, createSign } from 'crypto';

type GitHubInstallation = {
  id: number;
  account: {
    login: string;
  } | null;
};

type GitHubRepository = {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  clone_url: string;
  html_url: string;
};

type GitHubBranch = {
  name: string;
};

@Injectable()
export class GithubService {
  getInstallationUrl() {
    return (
      process.env.GITHUB_APP_INSTALL_URL ??
      (process.env.GITHUB_APP_SLUG
        ? `https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new`
        : null)
    );
  }

  async listInstallations() {
    const installations =
      await this.githubAppRequest<GitHubInstallation[]>('/app/installations');

    return installations.map((installation) => ({
      id: String(installation.id),
      accountLogin: installation.account?.login ?? 'unknown',
    }));
  }

  async listRepositories(installationId: string) {
    const repositories = await this.installationRequest<{
      repositories: GitHubRepository[];
    }>(installationId, '/installation/repositories');

    return repositories.repositories.map((repository) => ({
      id: String(repository.id),
      fullName: repository.full_name,
      defaultBranch: repository.default_branch,
      private: repository.private,
      repoUrl: repository.clone_url,
      htmlUrl: repository.html_url,
    }));
  }

  async listBranches(installationId: string, fullName: string) {
    const [owner, repo] = fullName.split('/');

    if (!owner || !repo) {
      throw new InternalServerErrorException('Invalid repository full name');
    }

    const branches = await this.installationRequest<GitHubBranch[]>(
      installationId,
      `/repos/${owner}/${repo}/branches`,
    );

    return branches.map((branch) => branch.name);
  }

  async getInstallationToken(installationId: string) {
    const response = await this.githubAppRequest<{ token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
      },
    );

    return response.token;
  }

  async verifyRepositoryAccess(installationId: string, fullName: string) {
    const [owner, repo] = fullName.split('/');

    if (!owner || !repo) {
      throw new InternalServerErrorException('Invalid repository full name');
    }

    await this.installationRequest(installationId, `/repos/${owner}/${repo}`);
  }

  private async installationRequest<T>(
    installationId: string,
    path: string,
    init?: RequestInit,
  ) {
    const token = await this.getInstallationToken(installationId);

    return this.githubRequest<T>(path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'kereo',
        ...(init?.headers ?? {}),
      },
    });
  }

  private async githubAppRequest<T>(path: string, init?: RequestInit) {
    const appJwt = this.createAppJwt();

    return this.githubRequest<T>(path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${appJwt}`,
        'User-Agent': 'kereo',
        ...(init?.headers ?? {}),
      },
    });
  }

  private async githubRequest<T>(path: string, init?: RequestInit) {
    const response = await fetch(`https://api.github.com${path}`, init);

    if (!response.ok) {
      const message = await response.text();
      throw new InternalServerErrorException(
        `GitHub request failed (${response.status}): ${message}`,
      );
    }

    return (await response.json()) as T;
  }

  private createAppJwt() {
    const appId = process.env.GITHUB_APP_ID;
    const privateKeyPem = process.env.GITHUB_APP_PRIVATE_KEY?.replace(
      /\\n/g,
      '\n',
    );

    if (!appId || !privateKeyPem) {
      throw new InternalServerErrorException(
        'Missing GitHub App configuration: GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY',
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const header = this.base64UrlEncode(
      JSON.stringify({
        alg: 'RS256',
        typ: 'JWT',
      }),
    );
    const payload = this.base64UrlEncode(
      JSON.stringify({
        iat: now - 60,
        exp: now + 540,
        iss: appId,
      }),
    );
    const data = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(data);
    signer.end();
    const privateKey = createPrivateKey(privateKeyPem);
    const signature = signer.sign(privateKey);

    return `${data}.${this.base64UrlEncode(signature)}`;
  }

  private base64UrlEncode(value: string | Buffer) {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
}
