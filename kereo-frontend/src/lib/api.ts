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
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export const authApi = {
  register: (email: string, password: string) =>
    apiClient.post<AuthUser>('/auth/register', { email, password }),
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>('/auth/login', { email, password }),
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
  slug: string | null;
  ecsServiceName: string | null;
  ecsTaskFamily: string | null;
  targetGroupArn: string | null;
  listenerRuleArn: string | null;
  publicUrl: string | null;
  latestDeployment: DeploymentSummary | null;
  deployments: DeploymentSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  repoUrl: string;
  branch?: string;
  dockerfilePath?: string;
  buildContext?: string;
  port?: number;
}

export const projectsApi = {
  list: () => apiClient.get<Project[]>('/projects'),
  get: (id: string) => apiClient.get<Project>(`/projects/${id}`),
  create: (dto: CreateProjectDto) => apiClient.post<Project>('/projects', dto),
  delete: (id: string) => apiClient.delete(`/projects/${id}`),
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
