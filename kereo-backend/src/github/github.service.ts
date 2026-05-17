import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createPrivateKey, createSign } from 'crypto';

type GitHubUserInstallation = {
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

type GitHubUserProfile = {
  id: number;
  login: string;
  avatar_url: string | null;
};

type GitHubUserEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
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

  getUserAuthUrl() {
    const clientId = process.env.GITHUB_CLIENT_ID;

    if (!clientId) {
      throw new InternalServerErrorException(
        'Missing GitHub OAuth configuration: GITHUB_CLIENT_ID',
      );
    }

    const redirectUri =
      process.env.GITHUB_OAUTH_REDIRECT_URI ??
      `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/g, '')}/api/auth/github/callback`;

    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'read:user user:email');

    return url.toString();
  }

  async listInstallationsForUser(accessToken: string) {
    const installations = await this.userRequest<{
      installations: GitHubUserInstallation[];
    }>(accessToken, '/user/installations');

    return installations.installations.map((installation) => ({
      id: String(installation.id),
      accountLogin: installation.account?.login ?? 'unknown',
    }));
  }

  async listRepositoriesForUser(accessToken: string, installationId: string) {
    const repositories = await this.userRequest<{
      repositories: GitHubRepository[];
    }>(accessToken, `/user/installations/${installationId}/repositories`);

    return repositories.repositories.map((repository) => ({
      id: String(repository.id),
      fullName: repository.full_name,
      defaultBranch: repository.default_branch,
      private: repository.private,
      repoUrl: repository.clone_url,
      htmlUrl: repository.html_url,
    }));
  }

  async listBranchesForUser(accessToken: string, fullName: string) {
    const [owner, repo] = fullName.split('/');

    if (!owner || !repo) {
      throw new InternalServerErrorException('Invalid repository full name');
    }

    const branches = await this.userRequest<GitHubBranch[]>(
      accessToken,
      `/repos/${owner}/${repo}/branches`,
    );

    return branches.map((branch) => branch.name);
  }

  async authenticateUser(code: string) {
    const accessToken = await this.exchangeGithubCode(code);
    const profile = await this.userRequest<GitHubUserProfile>(
      accessToken,
      '/user',
    );
    const emails = await this.userRequest<GitHubUserEmail[]>(
      accessToken,
      '/user/emails',
    );
    const primaryEmail = emails.find((email) => email.primary) ?? emails[0];

    if (!primaryEmail?.email) {
      throw new InternalServerErrorException(
        'GitHub account does not expose a usable email address',
      );
    }

    return {
      githubUserId: String(profile.id),
      githubLogin: profile.login,
      githubAvatarUrl: profile.avatar_url,
      githubAccessToken: accessToken,
      email: primaryEmail.email,
      emailVerified: primaryEmail.verified,
    };
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

  getCurrentConnection(input: {
    githubLogin: string | null;
    githubAvatarUrl: string | null;
    isEmailVerified: boolean;
    githubAccessToken?: string | null;
  }) {
    return {
      installUrl: this.getInstallationUrl(),
      connected: Boolean(input.githubLogin && input.githubAccessToken),
      githubLogin: input.githubLogin,
      githubAvatarUrl: input.githubAvatarUrl,
      isEmailVerified: input.isEmailVerified,
    };
  }

  getDebugConnectionState(input: {
    id: string;
    email: string;
    isEmailVerified: boolean;
    githubLogin: string | null;
    githubAvatarUrl: string | null;
    githubAccessToken?: string | null;
  }) {
    return {
      userId: input.id,
      email: input.email,
      isEmailVerified: input.isEmailVerified,
      githubLogin: input.githubLogin,
      githubAvatarUrl: input.githubAvatarUrl,
      hasGithubAccessToken: Boolean(input.githubAccessToken),
      githubAccessTokenLength: input.githubAccessToken?.length ?? 0,
    };
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

  private async userRequest<T>(
    accessToken: string,
    path: string,
    init?: RequestInit,
  ) {
    if (!accessToken) {
      throw new InternalServerErrorException(
        'GitHub account is not connected for this user',
      );
    }

    return this.githubRequest<T>(path, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
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

  private async exchangeGithubCode(code: string) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const redirectUri =
      process.env.GITHUB_OAUTH_REDIRECT_URI ??
      `${(process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/g, '')}/api/auth/github/callback`;

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'Missing GitHub OAuth configuration',
      );
    }

    const response = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'kereo',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    const body = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !body.access_token) {
      throw new InternalServerErrorException(
        `GitHub OAuth exchange failed: ${body.error_description ?? body.error ?? 'unknown error'}`,
      );
    }

    return body.access_token;
  }

  private createAppJwt() {
    const appId = process.env.GITHUB_APP_ID;
    const privateKeyPem = this.normalizePrivateKey(
      process.env.GITHUB_APP_PRIVATE_KEY,
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
    const privateKey = createPrivateKey({
      key: privateKeyPem,
      format: 'pem',
    });
    const signature = signer.sign(privateKey);

    return `${data}.${this.base64UrlEncode(signature)}`;
  }

  private normalizePrivateKey(value?: string) {
    if (!value) {
      return value;
    }

    const trimmed = value.trim();
    const unwrapped =
      trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1)
        : trimmed;

    return unwrapped.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  }

  private base64UrlEncode(value: string | Buffer) {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
}
