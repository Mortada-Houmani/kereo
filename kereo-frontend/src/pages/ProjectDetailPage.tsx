import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, RefreshCw, Trash2,
  Server, Database, Globe, GitBranch, GitCommit,
  AlertTriangle, Zap,
  HeartPulse,
  Save,
  Shield,
  Settings2,
  Plus,
  X,
} from 'lucide-react';
import {
  projectsApi,
  deploymentsApi,
  type Project,
  type ProjectDatabaseMode,
  type DeploymentSummary,
  type UpdateProjectDto,
} from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { DeploymentRow } from '../components/DeploymentRow';
import { DeploymentDetailPanel } from '../components/DeploymentDetailPanel';
import { timeAgo, repoName, shortSha } from '../lib/utils';
import './ProjectDetailPage.css';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(() => Boolean(id));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedDep, setSelectedDep] = useState<DeploymentSummary | null>(null);
  const [showDanger, setShowDanger] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  const [newEnvSecret, setNewEnvSecret] = useState(false);
  const [newEnvExposeToBuild, setNewEnvExposeToBuild] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [externalDatabaseUrl, setExternalDatabaseUrl] = useState('');
  const [projectForm, setProjectForm] = useState<UpdateProjectDto>({
    branch: '',
    dockerfilePath: '',
    buildContext: '',
    port: 3000,
    runtimeType: 'web-server',
    healthCheckPath: '/',
    databaseMode: 'managed-postgres',
  });

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await projectsApi.get(id);
      setProject(res.data);
      setProjectForm({
        name: res.data.name,
        branch: res.data.branch,
        dockerfilePath: res.data.dockerfilePath,
        buildContext: res.data.buildContext,
        port: res.data.port,
        runtimeType: res.data.runtimeType,
        healthCheckPath: res.data.healthCheckPath,
        databaseMode: res.data.databaseMode,
      });
      setSelectedDep(prev =>
        prev
          ? (res.data.deployments.find(d => d.id === prev.id) ?? res.data.deployments[0] ?? null)
          : (res.data.deployments[0] ?? null)
      );
    } catch {
      setError('Project not found');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    projectsApi.get(id)
      .then((res) => {
        if (cancelled) {
          return;
        }

        setProject(res.data);
        setSelectedDep(res.data.deployments[0] ?? null);
        setError('');
      })
      .catch(() => {
        if (!cancelled) {
          setError('Project not found');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Auto-refresh while active deployment
  useEffect(() => {
    const dep = project?.latestDeployment;
    if (!dep || dep.isTerminal) return;
    const timer = setInterval(() => { void load(true); }, 4000);
    return () => clearInterval(timer);
  }, [project?.latestDeployment, load]);

  async function handleDeploy() {
    if (!id) return;
    setDeploying(true);
    try {
      await deploymentsApi.deploy(id);
      await load();
    } finally {
      setDeploying(false);
    }
  }

  async function handleDelete() {
    if (!id || !project) return;
    setDeleteError('');
    setDeleting(true);
    try {
      await projectsApi.delete(id);
      setShowDeleteModal(false);
      navigate('/');
    } catch {
      setDeleting(false);
      setDeleteError('Deletion failed. Check AWS resources manually.');
    }
  }

  if (loading) {
    return (
      <div className="detail-page">
        <div className="detail-skeleton">
          <div className="skeleton" style={{ height: 28, width: 120, marginBottom: 20 }} />
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 380 }} />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="detail-page">
        <div className="empty-state">
          <AlertTriangle size={32} style={{ color: 'var(--red)' }} />
          <h3>{error || 'Project not found'}</h3>
          <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={13} /> Back to projects</Link>
        </div>
      </div>
    );
  }

  const latestDep = project.latestDeployment;
  const isActive = latestDep && !latestDep.isTerminal;

  async function handleSaveSettings(override?: UpdateProjectDto) {
    if (!id) return;
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      const payload = override ?? projectForm;
      const res = await projectsApi.update(id, payload);
      setProject(res.data);
      setProjectForm({
        name: res.data.name,
        branch: res.data.branch,
        dockerfilePath: res.data.dockerfilePath,
        buildContext: res.data.buildContext,
        port: res.data.port,
        runtimeType: res.data.runtimeType,
        healthCheckPath: res.data.healthCheckPath,
        databaseMode: res.data.databaseMode,
      });
      setSettingsMessage('Settings saved. Redeploy to apply runtime changes.');
    } catch {
      setSettingsMessage('Failed to save project settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddEnvVar() {
    if (!id || !newEnvKey) return;
    setSettingsMessage('');
    try {
      const res = await projectsApi.createEnvVar(id, {
        key: newEnvKey,
        value: newEnvValue,
        isSecret: newEnvSecret,
        exposeToBuild: newEnvExposeToBuild,
      });
      setProject((current) =>
        current
          ? {
              ...current,
              envVars: res.data,
              requiresRedeploy: true,
            }
          : current,
      );
      setNewEnvKey('');
      setNewEnvValue('');
      setNewEnvSecret(false);
      setNewEnvExposeToBuild(false);
    } catch {
      setSettingsMessage('Failed to save environment variable.');
    }
  }

  async function handleRemoveEnvVar(envVarId: string) {
    if (!id) return;
    setSettingsMessage('');
    try {
      const res = await projectsApi.deleteEnvVar(id, envVarId);
      setProject((current) =>
        current
          ? {
              ...current,
              envVars: res.data,
              requiresRedeploy: true,
            }
          : current,
      );
    } catch {
      setSettingsMessage('Failed to remove environment variable.');
    }
  }

  return (
    <div className="detail-page fade-up">
      {/* Breadcrumb */}
      <div className="detail-breadcrumb">
        <Link to="/" className="breadcrumb-link">
          <ArrowLeft size={13} strokeWidth={2} />
          Projects
        </Link>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{project.name}</span>
      </div>

      {/* ── Project Header Card ───────────────────────────────────────────────── */}
      <div className="detail-header card">
        <div className="detail-header-top">
          <div className="detail-header-identity">
            <h1 className="detail-project-name">{project.name}</h1>
            <div className="detail-project-meta">
              <span className="info-row mono">
                <GitBranch size={11} strokeWidth={2} />
                {repoName(project.repoUrl)}
                <span style={{ color: 'var(--border-focus)' }}>·</span>
                {project.branch}
              </span>
              {latestDep && (
                <StatusBadge status={latestDep.status} />
              )}
            </div>
          </div>

          <div className="detail-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(true)}>
              <Settings2 size={13} strokeWidth={2} />
              Edit Project Details
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowEnvModal(true)}>
              <Plus size={13} strokeWidth={2} />
              Add Env Var
            </button>
            <button className="btn btn-icon" onClick={() => load(true)} title="Refresh" disabled={refreshing}>
              <RefreshCw size={14} strokeWidth={2} className={refreshing ? 'spin-anim' : ''} />
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDeploy}
              disabled={deploying || !!isActive}
              title={isActive ? 'Deployment in progress' : 'Trigger deployment'}
            >
              {deploying
                ? <span className="spinner" />
                : <Zap size={13} strokeWidth={2.2} />}
              {deploying ? 'Triggering…' : 'Deploy'}
            </button>
          </div>
        </div>

        {/* ── Infra info strip ─────────────────────────────────────────────── */}
        <div className="detail-info-strip">
          {project.publicUrl && (
            <a
              href={project.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="detail-info-tile detail-info-tile--link"
            >
              <span className="detail-tile-label"><Globe size={11} /> Live URL</span>
              <span className="detail-tile-value">
                {project.publicUrl.replace(/^https?:\/\//, '')}
                <ExternalLink size={10} strokeWidth={2} />
              </span>
            </a>
          )}
          {project.ecsServiceName && (
            <div className="detail-info-tile">
              <span className="detail-tile-label"><Server size={11} /> ECS Service</span>
              <span className="detail-tile-value mono">{project.ecsServiceName}</span>
            </div>
          )}
          <div className="detail-info-tile">
            <span className="detail-tile-label"><Server size={11} /> Runtime</span>
            <span className="detail-tile-value">
              {project.runtimeType === 'static-site' ? 'Static site' : 'App server'}
            </span>
          </div>
          <div className="detail-info-tile">
            <span className="detail-tile-label"><Database size={11} /> Database mode</span>
            <span className="detail-tile-value">
              {project.databaseMode === 'none'
                ? 'No database'
                : project.databaseMode === 'external-database-url'
                  ? 'Existing DATABASE_URL'
                  : 'Managed Postgres'}
            </span>
          </div>
          <div className="detail-info-tile">
            <span className="detail-tile-label"><HeartPulse size={11} /> Health check</span>
            <span className="detail-tile-value mono">{project.healthCheckPath}</span>
          </div>
          {latestDep?.databaseName && (
            <div className="detail-info-tile">
              <span className="detail-tile-label"><Database size={11} /> Database</span>
              <span className="detail-tile-value mono">{latestDep.databaseName}</span>
            </div>
          )}
          {latestDep?.commitSha && (
            <div className="detail-info-tile">
              <span className="detail-tile-label"><GitCommit size={11} /> Commit</span>
              <span className="detail-tile-value mono">{shortSha(latestDep.commitSha)}</span>
            </div>
          )}
          <div className="detail-info-tile detail-info-tile--right">
            <span className="detail-tile-label">Last deployed</span>
            <span className="detail-tile-value">
              {latestDep ? timeAgo(latestDep.updatedAt) : timeAgo(project.createdAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div className="section-label" style={{ marginBottom: 6 }}>
              <Shield size={12} /> Environment
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
              Runtime configuration for your deployed app.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {project.requiresRedeploy && (
              <span className="badge badge-warn">Configuration changed. Redeploy required.</span>
            )}
            <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowEnvModal(true)}>
              <Plus size={12} strokeWidth={2} />
              Add Env Var
            </button>
          </div>
        </div>

        {!project.deployConfigValid && (
          <div className="delete-modal-error" style={{ marginBottom: 14 }}>
            <AlertTriangle size={14} strokeWidth={2} />
            <span>{project.deployConfigErrors.join(' ')}</span>
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          {project.envVars.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
              No environment variables yet.
            </div>
          ) : (
            project.envVars.map((envVar) => (
              <div
                key={envVar.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  gap: 12,
                }}
              >
                <div>
                  <div className="mono" style={{ fontWeight: 600 }}>
                    {envVar.key}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>
                    {envVar.isSecret ? 'Secret' : 'Plain env'}
                    {envVar.exposeToBuild ? ' · build + runtime' : ' · runtime only'}
                    {' '}· updated {timeAgo(envVar.updatedAt)}
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRemoveEnvVar(envVar.id)}
                  type="button"
                >
                  <X size={12} strokeWidth={2} />
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        {settingsMessage && (
          <div style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: '.82rem' }}>
            {settingsMessage}
          </div>
        )}
      </div>

      {/* ── Deployments Split ────────────────────────────────────────────────── */}
      <div className="detail-split">
        {/* Left: deployment history */}
        <div className="deployments-col">
          <div className="col-header">
            <span className="section-label">Deployment History</span>
            <span className="dep-count">{project.deployments.length}</span>
          </div>

          {project.deployments.length === 0 ? (
            <div className="empty-state" style={{ padding: '36px 16px' }}>
              <Zap size={24} style={{ color: 'var(--text-muted)' }} />
              <p>No deployments yet. Trigger one above.</p>
            </div>
          ) : (
            <div className="deployment-list">
              {project.deployments.map(dep => (
                <DeploymentRow
                  key={dep.id}
                  dep={dep}
                  active={selectedDep?.id === dep.id}
                  onClick={() => setSelectedDep(dep)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: deployment detail */}
        {selectedDep && (
          <div className="detail-panel-col">
            <DeploymentDetailPanel dep={selectedDep} key={selectedDep.id} />
          </div>
        )}
      </div>

      {/* ── Danger Zone ──────────────────────────────────────────────────────── */}
      <div className="danger-zone">
        <div className="danger-zone-header">
          <AlertTriangle size={14} strokeWidth={2} style={{ color: 'var(--red)' }} />
          <span className="danger-zone-title">Danger Zone</span>
        </div>
        <div className="danger-zone-body">
          <div>
            <div className="danger-zone-desc" style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 3 }}>
              Delete this project
            </div>
            <div className="danger-zone-desc">
              Removes the ECS service, target group, CloudWatch log group, and project secrets.
              {project.databaseMode === 'managed-postgres'
                ? ' It also deletes the managed Postgres database for this project.'
                : ''}
              This action <strong>cannot be undone</strong>.
            </div>
          </div>
          {showDanger ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDanger(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setDeleteError('');
                  setShowDeleteModal(true);
                }}
                disabled={deleting}
              >
                {deleting ? <span className="spinner" /> : <Trash2 size={12} strokeWidth={2} />}
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          ) : (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setShowDanger(true)}
              style={{ flexShrink: 0 }}
            >
              <Trash2 size={12} strokeWidth={2} />
              Delete project
            </button>
          )}
        </div>
      </div>

      {showDeleteModal && (
        <div
          className="delete-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setShowDeleteModal(false);
            }
          }}
        >
          <div className="delete-modal-panel scale-in">
            <div className="delete-modal-header">
              <div className="delete-modal-icon">
                <AlertTriangle size={16} strokeWidth={2} />
              </div>
              <div className="delete-modal-copy">
                <h3>Delete project?</h3>
                <p>
                  <strong>{project.name}</strong> will be removed along with its ECS service,
                  target group, CloudWatch logs, and project secrets.
                  {project.databaseMode === 'managed-postgres'
                    ? ' The managed project database will be deleted too.'
                    : ''}
                </p>
              </div>
            </div>

            <div className="delete-modal-note">
              This action cannot be undone.
            </div>

            {deleteError && (
              <div className="delete-modal-error">
                <AlertTriangle size={14} strokeWidth={2} />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="delete-modal-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <span className="spinner" /> : <Trash2 size={12} strokeWidth={2} />}
                {deleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowEditModal(false); }}>
          <div className="modal-panel scale-in">
            <div className="modal-header">
              <div className="modal-title-group">
                <h2 className="modal-title">Edit Project Details</h2>
                <p className="modal-subtitle">Update build, runtime, and health-check settings.</p>
              </div>
              <button className="modal-close-btn" onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <label className="field">
                <span className="label">Branch</span>
                <input
                  value={projectForm.branch ?? ''}
                  onChange={(e) => setProjectForm((current) => ({ ...current, branch: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="label">Dockerfile</span>
                <input
                  value={projectForm.dockerfilePath ?? ''}
                  onChange={(e) => setProjectForm((current) => ({ ...current, dockerfilePath: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="label">Build Context</span>
                <input
                  value={projectForm.buildContext ?? ''}
                  onChange={(e) => setProjectForm((current) => ({ ...current, buildContext: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="label">Port</span>
                <input
                  type="number"
                  value={projectForm.port ?? 3000}
                  onChange={(e) => setProjectForm((current) => ({ ...current, port: Number(e.target.value) }))}
                />
              </label>
              <label className="field">
                <span className="label">Runtime</span>
                <select
                  value={projectForm.runtimeType ?? 'web-server'}
                  onChange={(e) => setProjectForm((current) => ({ ...current, runtimeType: e.target.value as Project['runtimeType'] }))}
                >
                  <option value="web-server">App server</option>
                  <option value="static-site">Static site</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Health Check Path</span>
                <input
                  value={projectForm.healthCheckPath ?? '/'}
                  onChange={(e) => setProjectForm((current) => ({ ...current, healthCheckPath: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="label">Database Mode</span>
                <select
                  value={projectForm.databaseMode ?? 'managed-postgres'}
                  onChange={(e) => setProjectForm((current) => ({ ...current, databaseMode: e.target.value as ProjectDatabaseMode }))}
                >
                  <option value="none">No database</option>
                  <option value="managed-postgres">Managed Postgres</option>
                  <option value="external-database-url">Existing DATABASE_URL</option>
                </select>
              </label>
              {projectForm.databaseMode === 'external-database-url' ? (
                <label className="field">
                  <span className="label">External DATABASE_URL</span>
                  <input
                    value={externalDatabaseUrl}
                    onChange={(e) => setExternalDatabaseUrl(e.target.value)}
                    placeholder="Leave blank to keep current secret"
                  />
                </label>
              ) : null}
              <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                Repo: <span className="mono">{project.githubRepositoryFullName ?? repoName(project.repoUrl)}</span>
                {project.githubInstallationId ? (
                  <> · GitHub App installation <span className="mono">{project.githubInstallationId}</span></>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await handleSaveSettings(
                    projectForm.databaseMode === 'external-database-url' && externalDatabaseUrl
                      ? { ...projectForm, externalDatabaseUrl }
                      : projectForm,
                  );
                  setShowEditModal(false);
                  setExternalDatabaseUrl('');
                }}
                disabled={savingSettings}
              >
                {savingSettings ? <span className="spinner" /> : <Save size={12} strokeWidth={2} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnvModal && (
        <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowEnvModal(false); }}>
          <div className="modal-panel scale-in">
            <div className="modal-header">
              <div className="modal-title-group">
                <h2 className="modal-title">Add Environment Variable</h2>
                <p className="modal-subtitle">Secrets stay masked after creation.</p>
              </div>
              <button className="modal-close-btn" onClick={() => setShowEnvModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
              <label className="field">
                <span className="label">Key</span>
                <input value={newEnvKey} onChange={(e) => setNewEnvKey(e.target.value.toUpperCase())} />
              </label>
              <label className="field">
                <span className="label">{newEnvSecret ? 'Secret value' : 'Value'}</span>
                <input value={newEnvValue} onChange={(e) => setNewEnvValue(e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Secret</span>
                <input
                  type="checkbox"
                  checked={newEnvSecret}
                  onChange={(e) => setNewEnvSecret(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
              </label>
              <label className="field">
                <span className="label">Expose to build</span>
                <input
                  type="checkbox"
                  checked={newEnvExposeToBuild}
                  onChange={(e) => setNewEnvExposeToBuild(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
              </label>
              <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                Turn this on for frontend build variables like <span className="mono">VITE_API_URL</span>.
                Anything exposed at build time can be baked into shipped assets.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEnvModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await handleAddEnvVar();
                  setShowEnvModal(false);
                }}
                type="button"
              >
                <Plus size={12} strokeWidth={2} />
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
