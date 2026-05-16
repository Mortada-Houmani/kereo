import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, RefreshCw, Trash2,
  Server, Database, Globe, GitBranch, GitCommit,
  AlertTriangle, Zap,
  HeartPulse,
} from 'lucide-react';
import { projectsApi, deploymentsApi, type Project, type DeploymentSummary } from '../lib/api';
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

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await projectsApi.get(id);
      setProject(res.data);
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
            <span className="detail-tile-label"><HeartPulse size={11} /> Health check</span>
            <span className="detail-tile-value mono">{project.healthCheckPath}</span>
          </div>
          {project.runtimeType === 'static-site' && project.slug && (
            <div className="detail-info-tile">
              <span className="detail-tile-label"><Globe size={11} /> Build base path</span>
              <span className="detail-tile-value mono">{`/apps/${project.slug}/`}</span>
            </div>
          )}
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
              Removes the ECS service, target group, CloudWatch log group, SSM parameter, and RDS database.
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
                  target group, CloudWatch logs, SSM parameter, and project database.
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
    </div>
  );
}
