import { useEffect, useMemo, useState } from 'react';
import {
  X,
  Loader2,
  GitBranch,
  Terminal,
  Globe,
  Server,
  AlertTriangle,
  Activity,
  Plus,
  Minus,
} from 'lucide-react';
import {
  projectsApi,
  githubApi,
  type CreateProjectDto,
  type GithubInstallation,
  type GithubRepository,
  type ProjectDatabaseMode,
  type ProjectRuntimeType,
} from '../lib/api';
import './CreateProjectModal.css';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const defaults: CreateProjectDto = {
  name: '',
  repoUrl: '',
  branch: 'main',
  dockerfilePath: 'Dockerfile',
  buildContext: '.',
  port: 3000,
  runtimeType: 'web-server',
  healthCheckPath: '/',
  databaseMode: 'managed-postgres',
};

const runtimeDefaults: Record<ProjectRuntimeType, number> = {
  'web-server': 3000,
  'static-site': 80,
};

export function CreateProjectModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreateProjectDto>(defaults);
  const [repositoryMode, setRepositoryMode] = useState<'github' | 'manual'>(
    'github',
  );
  const [loading, setLoading] = useState(false);
  const [loadingGithub, setLoadingGithub] = useState(true);
  const [error, setError] = useState('');
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [installations, setInstallations] = useState<GithubInstallation[]>([]);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  const selectedRepository = useMemo(
    () =>
      repositories.find(
        (repository) => repository.id === form.githubRepositoryId,
      ) ?? null,
    [repositories, form.githubRepositoryId],
  );
  const needsRepositoryAccess =
    githubConnected && !loadingGithub && installations.length === 0;
  const usingGithubRepository = repositoryMode === 'github';

  function set(
    key: keyof CreateProjectDto,
    value: string | number | ProjectRuntimeType | ProjectDatabaseMode,
  ) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function bumpPort(delta: number) {
    setForm((current) => ({
      ...current,
      port: Math.max(1, Number(current.port ?? 1) + delta),
    }));
  }

  function setRuntimeType(runtimeType: ProjectRuntimeType) {
    setForm((current) => {
      const nextPort =
        current.port === undefined ||
        current.port === runtimeDefaults[current.runtimeType ?? 'web-server']
          ? runtimeDefaults[runtimeType]
          : current.port;

      return {
        ...current,
        runtimeType,
        port: nextPort,
        databaseMode:
          runtimeType === 'static-site' &&
          current.databaseMode === 'managed-postgres'
            ? 'none'
            : current.databaseMode,
      };
    });
  }

  useEffect(() => {
    let cancelled = false;

    githubApi
      .getConnection()
      .then(async (connectionRes) => {
        if (cancelled) return;
        setInstallUrl(connectionRes.data.installUrl);
        setGithubConnected(connectionRes.data.connected);
        if (!connectionRes.data.connected || !connectionRes.data.isEmailVerified) {
          setInstallations([]);
          return;
        }
        const installationsRes = await githubApi.listInstallations();
        if (cancelled) return;
        setInstallations(installationsRes.data);
        if (installationsRes.data.length === 1) {
          setForm((current) => ({
            ...current,
            githubInstallationId: installationsRes.data[0].id,
          }));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load GitHub repositories');
      })
      .finally(() => {
        if (!cancelled) setLoadingGithub(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.githubInstallationId) {
      return;
    }

    let cancelled = false;
    githubApi
      .listRepositories(form.githubInstallationId)
      .then((res) => {
        if (cancelled) return;
        setRepositories(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load GitHub repositories');
      });

    return () => {
      cancelled = true;
    };
  }, [form.githubInstallationId]);

  useEffect(() => {
    if (!form.githubInstallationId || !form.githubRepositoryFullName) {
      return;
    }

    let cancelled = false;
    githubApi
      .listBranches(form.githubInstallationId, form.githubRepositoryFullName)
      .then((res) => {
        if (cancelled) return;
        setBranches(res.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load repository branches');
      });

    return () => {
      cancelled = true;
    };
  }, [form.githubInstallationId, form.githubRepositoryFullName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await projectsApi.create({
        ...form,
        port: Number(form.port),
        repoUrl: usingGithubRepository
          ? selectedRepository?.repoUrl ?? form.repoUrl
          : form.repoUrl,
        githubInstallationId: usingGithubRepository
          ? form.githubInstallationId
          : undefined,
        githubRepositoryId: usingGithubRepository
          ? form.githubRepositoryId
          : undefined,
        githubRepositoryFullName: usingGithubRepository
          ? form.githubRepositoryFullName
          : undefined,
        githubDefaultBranch: usingGithubRepository
          ? form.githubDefaultBranch
          : undefined,
      });
      onCreated();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Failed to create project'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel scale-in">
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-title">New Project</h2>
            <p className="modal-subtitle">Connect a repository to deploy as an ECS service.</p>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-body">
            {/* General Info */}
            <div className="form-section">
              <span className="section-label">General Information</span>
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="proj-name">
                    Display Name
                    <span className="label-hint">(Internal identifier)</span>
                  </label>
                  <input
                    id="proj-name"
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="e.g. backend-api"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Repository Info */}
            <div className="form-section">
              <span className="section-label">Repository Configuration</span>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label">Repository Source</label>
                <div className="runtime-toggle" role="tablist" aria-label="Repository source">
                  <button
                    type="button"
                    className={`runtime-option ${repositoryMode === 'github' ? 'runtime-option--active' : ''}`}
                    onClick={() => setRepositoryMode('github')}
                    disabled={loading}
                  >
                    <Globe size={13} strokeWidth={2} />
                    <span>GitHub</span>
                  </button>
                  <button
                    type="button"
                    className={`runtime-option ${repositoryMode === 'manual' ? 'runtime-option--active' : ''}`}
                    onClick={() => setRepositoryMode('manual')}
                    disabled={loading}
                  >
                    <Terminal size={13} strokeWidth={2} />
                    <span>Manual URL</span>
                  </button>
                </div>
              </div>
              <div className="form-grid">
                {usingGithubRepository ? (
                  <>
                    <div className="field">
                      <label className="label" htmlFor="proj-installation">
                        <Globe size={11} style={{ marginRight: 4 }} />
                        GitHub Installation
                      </label>
                      <select
                        id="proj-installation"
                        value={form.githubInstallationId ?? ''}
                        onChange={e => {
                          const installationId = e.target.value || undefined;
                          setForm((current) => ({
                            ...current,
                            githubInstallationId: installationId,
                            githubRepositoryId: undefined,
                            githubRepositoryFullName: undefined,
                            githubDefaultBranch: undefined,
                            repoUrl: '',
                            branch: 'main',
                          }));
                          setRepositories([]);
                          setBranches([]);
                        }}
                        disabled={loading}
                      >
                        <option value="">
                          {loadingGithub
                            ? 'Loading repository access...'
                            : needsRepositoryAccess
                              ? 'Grant repository access first'
                              : 'Select installation'}
                        </option>
                        {installations.map((installation) => (
                          <option key={installation.id} value={installation.id}>
                            {installation.accountLogin}
                          </option>
                        ))}
                      </select>
                      <span className="field-hint">
                        {!githubConnected ? (
                          <>
                            Connect GitHub from the Integrations tab first, then install the GitHub App.
                            {' '}
                            {installUrl ? (
                              <a href={installUrl} target="_blank" rel="noreferrer">
                                Open install page
                              </a>
                            ) : null}
                          </>
                        ) : needsRepositoryAccess && installUrl ? (
                          <>
                            Your account is connected. Grant the Kereo GitHub App access to the repos
                            you want to deploy.
                            {' '}
                            <a href={installUrl} target="_blank" rel="noreferrer">
                              Grant repository access
                            </a>
                          </>
                        ) : installUrl ? (
                          <>
                            Need another repo here? Update the GitHub App installation in your account or org.
                            {' '}
                            <a href={installUrl} target="_blank" rel="noreferrer">
                              Manage repository access
                            </a>
                          </>
                        ) : (
                          'Configure the GitHub App to browse installed repositories.'
                        )}
                      </span>
                    </div>

                    <div className="field">
                      <label className="label" htmlFor="proj-repo">
                        <Globe size={11} style={{ marginRight: 4 }} />
                        Repository
                      </label>
                      <select
                        id="proj-repo"
                        value={form.githubRepositoryId ?? ''}
                        onChange={e => {
                          const repository =
                            repositories.find((item) => item.id === e.target.value) ?? null;
                          setForm((current) => ({
                            ...current,
                            githubRepositoryId: repository?.id,
                            githubRepositoryFullName: repository?.fullName,
                            githubDefaultBranch: repository?.defaultBranch,
                            repoUrl: repository?.repoUrl ?? '',
                            branch: repository?.defaultBranch ?? current.branch,
                          }));
                          setBranches([]);
                        }}
                        required={usingGithubRepository}
                        disabled={loading || !form.githubInstallationId}
                      >
                        <option value="">Select repository</option>
                        {repositories.map((repository) => (
                          <option key={repository.id} value={repository.id}>
                            {repository.fullName}
                            {repository.private ? ' (private)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="field form-grid-span-2">
                    <label className="label" htmlFor="proj-repo-url">
                      <Globe size={11} style={{ marginRight: 4 }} />
                      Repository URL
                    </label>
                    <input
                      id="proj-repo-url"
                      value={form.repoUrl ?? ''}
                      onChange={(e) => set('repoUrl', e.target.value)}
                      placeholder="https://github.com/owner/repo.git"
                      required
                      disabled={loading}
                    />
                    <span className="field-hint">
                      Use any Git URL your build environment can clone. GitHub sign-in is optional here.
                    </span>
                  </div>
                )}

                <div className="field">
                  <label className="label" htmlFor="proj-branch">
                    <GitBranch size={11} style={{ marginRight: 4 }} />
                    Default Branch
                  </label>
                  <select
                    id="proj-branch"
                    value={form.branch}
                    onChange={e => set('branch', e.target.value)}
                    disabled={loading || branches.length === 0}
                  >
                    {branches.length === 0 ? (
                      <option value={form.branch ?? 'main'}>
                        {form.branch ?? 'main'}
                      </option>
                    ) : (
                      branches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* Infrastructure Settings */}
            <div className="form-section">
              <span className="section-label">Infrastructure & Build</span>
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="proj-port">
                    <Server size={11} style={{ marginRight: 4 }} />
                    App Port
                  </label>
                  <div className="number-stepper">
                    <button
                      type="button"
                      className="number-stepper-btn"
                      onClick={() => bumpPort(-1)}
                      disabled={loading || Number(form.port ?? 3000) <= 1}
                      aria-label="Decrease port"
                    >
                      <Minus size={14} strokeWidth={2} />
                    </button>
                    <input
                      id="proj-port"
                      className="number-stepper-input"
                      type="number"
                      value={form.port}
                      onChange={e => set('port', Number(e.target.value))}
                      placeholder="3000"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="number-stepper-btn"
                      onClick={() => bumpPort(1)}
                      disabled={loading}
                      aria-label="Increase port"
                    >
                      <Plus size={14} strokeWidth={2} />
                    </button>
                  </div>
                  <span className="field-hint">
                    {form.runtimeType === 'static-site'
                      ? 'Static-site containers usually listen on port 80.'
                      : 'Traffic is routed to the port your server listens on.'}
                  </span>
                </div>

                <div className="field">
                  <label className="label">Runtime Type</label>
                  <div className="runtime-toggle" role="tablist" aria-label="Project runtime">
                    <button
                      type="button"
                      className={`runtime-option ${form.runtimeType === 'web-server' ? 'runtime-option--active' : ''}`}
                      onClick={() => setRuntimeType('web-server')}
                      disabled={loading}
                    >
                      <Server size={13} strokeWidth={2} />
                      <span>App server</span>
                    </button>
                    <button
                      type="button"
                      className={`runtime-option ${form.runtimeType === 'static-site' ? 'runtime-option--active' : ''}`}
                      onClick={() => setRuntimeType('static-site')}
                      disabled={loading}
                    >
                      <Globe size={13} strokeWidth={2} />
                      <span>Static site</span>
                    </button>
                  </div>
                  <span className="field-hint">
                    {form.runtimeType === 'static-site'
                      ? 'Use this for Dockerized sites served by nginx or another static web server.'
                      : 'Use this for containers that run their own web server process.'}
                  </span>
                </div>

                <div className="field">
                  <label className="label" htmlFor="proj-dockerfile">
                    <Terminal size={11} style={{ marginRight: 4 }} />
                    Dockerfile
                  </label>
                  <input
                    id="proj-dockerfile"
                    value={form.dockerfilePath}
                    onChange={e => set('dockerfilePath', e.target.value)}
                    placeholder="Dockerfile"
                    disabled={loading}
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="proj-health-check">
                    <Activity size={11} style={{ marginRight: 4 }} />
                    Health Check Path
                  </label>
                  <input
                    id="proj-health-check"
                    value={form.healthCheckPath}
                    onChange={e => set('healthCheckPath', e.target.value)}
                    placeholder="/"
                    disabled={loading}
                  />
                  <span className="field-hint">
                    Kereo will use this ALB health check path for the project target group.
                  </span>
                </div>

                <div className="field form-grid-span-2">
                  <label className="label" htmlFor="proj-context">Build Context</label>
                  <input
                    id="proj-context"
                    value={form.buildContext}
                    onChange={e => set('buildContext', e.target.value)}
                    placeholder="."
                    disabled={loading}
                  />
                </div>

                <div className="field form-grid-span-2">
                  <label className="label">Database</label>
                  <select
                    value={form.databaseMode ?? 'managed-postgres'}
                    onChange={(e) => set('databaseMode', e.target.value as ProjectDatabaseMode)}
                    disabled={loading}
                  >
                    <option value="none">No database</option>
                    <option value="managed-postgres">Managed Postgres</option>
                    <option value="external-database-url">Existing DATABASE_URL</option>
                  </select>
                  <span className="field-hint">
                    Frontends usually want no database. Use existing DATABASE_URL if your app already has one.
                  </span>
                </div>

                {form.databaseMode === 'external-database-url' && (
                  <div className="field form-grid-span-2">
                    <label className="label" htmlFor="proj-external-db">External DATABASE_URL</label>
                    <input
                      id="proj-external-db"
                      value={form.externalDatabaseUrl ?? ''}
                      onChange={(e) => set('externalDatabaseUrl', e.target.value)}
                      placeholder="postgresql://user:pass@host:5432/db"
                      disabled={loading}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Warning Box */}
            <div className="modal-warning">
              <AlertTriangle size={14} style={{ color: 'var(--yellow)', flexShrink: 0 }} />
              <p>
                Kereo will provision an ECS service and CloudWatch logs.
                {form.databaseMode === 'managed-postgres'
                  ? ' It will also create a managed Postgres database for this project.'
                  : form.databaseMode === 'external-database-url'
                    ? ' It will inject your external DATABASE_URL as a secret.'
                    : ' No database will be created for this project.'}
                Initial setup takes about 20s.
              </p>
            </div>

            {form.runtimeType === 'static-site' && (
              <div className="modal-runtime-note fade-in">
                <Globe size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <p>
                  Kereo will publish static sites on their own subdomain, so most React and Vite apps can
                  keep their default root configuration.
                </p>
              </div>
            )}

            {error && (
              <div className="field-error fade-in" style={{ marginTop: 12 }}>
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="spin-anim" /> : null}
              {loading ? 'Provisioning Resources…' : 'Create & Deploy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
