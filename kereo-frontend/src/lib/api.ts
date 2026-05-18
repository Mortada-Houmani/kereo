import axios from 'axios';

function normalizeApiBase(value: string) {
  const trimmed = value.replace(/\/+$/g, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const BASE_URL = configuredApiUrl ? normalizeApiBase(configuredApiUrl) : '/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('kereo_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('kereo_token');
      localStorage.removeItem('kereo_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  isEmailVerified: boolean;
  githubLogin: string | null;
  githubAvatarUrl: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export const authApi = {
  register: (email: string, password: string, confirmPassword: string) =>
    apiClient.post<LoginResponse>('/auth/register', {
      email,
      password,
      confirmPassword,
    }),
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }),
  verifyEmail: (token: string) =>
    apiClient.post<{ success: true }>('/auth/verify-email', { token }),
  resendVerification: (email: string) =>
    apiClient.post<{ success: true }>('/auth/resend-verification', { email }),
  getGithubAuthUrl: () =>
    apiClient.get<{ url: string }>('/auth/github/url'),
};

// ── Projects ──────────────────────────────────────────────────────────────────
export type DeploymentStatus =
  | 'queued'
  | 'cloning'
  | 'building'
  | 'pushing'
  | 'deploying'
  | 'success'
  | 'failed';

export type DeploymentPhase =
  | 'queued'
  | 'build'
  | 'database'
  | 'secrets'
  | 'logging'
  | 'ecs'
  | 'live'
  | 'failed';

export type ProjectRuntimeType = 'web-server' | 'static-site';
export type ProjectDatabaseMode =
  | 'none'
  | 'managed-postgres'
  | 'external-database-url';

export interface DeploymentSummary {
  id: string;
  status: DeploymentStatus;
  phase: DeploymentPhase;
  phaseLabel: string | null;
  commitSha: string | null;
  imageUrl: string | null;
  liveUrl: string | null;
  codebuildBuildId: string | null;
  codebuildStatus: string | null;
  taskDefinitionArn: string | null;
  databaseName: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  isActive: boolean;
  isTerminal: boolean;
}

export interface Project {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  dockerfilePath: string;
  buildContext: string;
  port: number;
  runtimeType: ProjectRuntimeType;
  healthCheckPath: string;
  databaseMode: ProjectDatabaseMode;
  slug: string | null;
  ecsServiceName: string | null;
  ecsTaskFamily: string | null;
  targetGroupArn: string | null;
  listenerRuleArn: string | null;
  publicUrl: string | null;
  githubInstallationId: string | null;
  githubRepositoryId: string | null;
  githubRepositoryFullName: string | null;
  githubDefaultBranch: string | null;
  envVars: ProjectEnvVar[];
  deployConfigValid: boolean;
  deployConfigErrors: string[];
  requiresRedeploy: boolean;
  latestDeployment: DeploymentSummary | null;
  deployments: DeploymentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectEnvVar {
  id: string;
  key: string;
  isSecret: boolean;
  hasValue: boolean;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  repoUrl?: string;
  branch?: string;
  dockerfilePath?: string;
  buildContext?: string;
  port?: number;
  runtimeType?: ProjectRuntimeType;
  healthCheckPath?: string;
  databaseMode?: ProjectDatabaseMode;
  externalDatabaseUrl?: string;
  githubInstallationId?: string;
  githubRepositoryId?: string;
  githubRepositoryFullName?: string;
  githubDefaultBranch?: string;
}

export type UpdateProjectDto = Partial<CreateProjectDto>;

export interface UpsertProjectEnvVarDto {
  key: string;
  value?: string;
  isSecret?: boolean;
}

export interface GithubAppInfo {
  installUrl: string | null;
}

export interface GithubConnectionInfo extends GithubAppInfo {
  connected: boolean;
  githubLogin: string | null;
  githubAvatarUrl: string | null;
  isEmailVerified: boolean;
}

export interface GithubInstallation {
  id: string;
  accountLogin: string;
}

export interface GithubRepository {
  id: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  repoUrl: string;
  htmlUrl: string;
}

export const projectsApi = {
  list: () => apiClient.get<Project[]>('/projects'),
  get: (id: string) => apiClient.get<Project>(`/projects/${id}`),
  create: (dto: CreateProjectDto) => apiClient.post<Project>('/projects', dto),
  update: (id: string, dto: UpdateProjectDto) =>
    apiClient.patch<Project>(`/projects/${id}`, dto),
  listEnvVars: (id: string) =>
    apiClient.get<ProjectEnvVar[]>(`/projects/${id}/env`),
  createEnvVar: (id: string, dto: UpsertProjectEnvVarDto) =>
    apiClient.post<ProjectEnvVar[]>(`/projects/${id}/env`, dto),
  updateEnvVar: (id: string, envVarId: string, dto: UpsertProjectEnvVarDto) =>
    apiClient.patch<ProjectEnvVar[]>(`/projects/${id}/env/${envVarId}`, dto),
  deleteEnvVar: (id: string, envVarId: string) =>
    apiClient.delete<ProjectEnvVar[]>(`/projects/${id}/env/${envVarId}`),
  delete: (id: string) => apiClient.delete(`/projects/${id}`),
};

export const githubApi = {
  getAppInfo: () => apiClient.get<GithubAppInfo>('/github/app'),
  getConnection: () => apiClient.get<GithubConnectionInfo>('/github/connection'),
  listInstallations: () => apiClient.get<GithubInstallation[]>('/github/installations'),
  listRepositories: (installationId: string) =>
    apiClient.get<GithubRepository[]>(
      `/github/installations/${installationId}/repositories`,
    ),
  listBranches: (installationId: string, fullName: string) => {
    const [owner, repo] = fullName.split('/');
    return apiClient.get<string[]>(
      `/github/installations/${installationId}/repositories/${owner}/${repo}/branches`,
    );
  },
};

// ── Deployments ───────────────────────────────────────────────────────────────
export interface DeploymentDetail extends DeploymentSummary {
  logs: string | null;
}

export const deploymentsApi = {
  deploy: (projectId: string) =>
    apiClient.post<DeploymentSummary>(`/projects/${projectId}/deploy`),
  listByProject: (projectId: string) =>
    apiClient.get<DeploymentSummary[]>(`/projects/${projectId}/deployments`),
  get: (id: string) =>
    apiClient.get<DeploymentDetail>(`/deployments/${id}`),
};
