import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, RefreshCw, Trash2,
  Server, Database, Hash, Globe, GitBranch,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedDep, setSelectedDep] = useState<DeploymentSummary | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await projectsApi.get(id);
      setProject(res.data);
      // Keep selected dep in sync
      setSelectedDep(prev =>
        prev ? (res.data.deployments.find(d => d.id === prev.id) ?? res.data.deployments[0] ?? null) : (res.data.deployments[0] ?? null)
      );
    } catch {
      setError('Project not found');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh while active deployment
  useEffect(() => {
    const dep = project?.latestDeployment;
    if (!dep || dep.isTerminal) return;
    const timer = setInterval(() => { void load(); }, 4000);
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
    if (!confirm(`Delete "${project.name}" and all AWS resources? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await projectsApi.delete(id);
      navigate('/');
    } catch {
      setDeleting(false);
      alert('Deletion failed. Check AWS resources manually.');
    }
  }

  if (loading) {
    return (
      <div className="detail-page">
        <div className="detail-skeleton">
          {[180, 300, 200].map((h, i) => (
            <div key={i} className="skeleton" style={{ height: h, borderRadius: 'var(--radius)' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="detail-page">
        <div className="empty-state">
          <p style={{ color: 'var(--red)' }}>{error || 'Project not found'}</p>
          <Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={14} /> Back</Link>
        </div>
      </div>
    );
  }

  const latestDep = project.latestDeployment;

  return (
    <div className="detail-page fade-in">
      {/* Breadcrumb */}
      <div className="detail-breadcrumb">
        <Link to="/" className="breadcrumb-link">
          <ArrowLeft size={14} strokeWidth={2} />
          Projects
        </Link>
        <span className="breadcrumb-sep">/</span>
        <span>{project.name}</span>
      </div>

      {/* Project Header */}
      <div className="detail-header card">
        <div className="detail-header-top">
          <div>
            <h1 className="detail-project-name">{project.name}</h1>
            <div className="detail-project-meta">
              <span className="mono" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <GitBranch size={12} strokeWidth={2} />
                {repoName(project.repoUrl)} · {project.branch}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>Updated {timeAgo(project.updatedAt)}</span>
            </div>
          </div>
          <div className="detail-header-actions">
            {latestDep && <StatusBadge status={latestDep.status} />}
            <button className="btn btn-ghost btn-sm" onClick={load} title="Refresh">
              <RefreshCw size={13} strokeWidth={2} />
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDeploy}
              disabled={deploying}
            >
              {deploying ? <span className="spinner" /> : <RefreshCw size={13} strokeWidth={2} />}
              {deploying ? 'Deploying…' : 'Deploy'}
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete project"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="detail-info-grid">
          {project.publicUrl && (
            <div className="detail-info-item">
              <span className="detail-info-label"><Globe size={12} /> Live URL</span>
              <a
                href={project.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-info-value detail-link"
              >
                {project.publicUrl.replace(/^https?:\/\//, '')}
                <ExternalLink size={11} strokeWidth={2} />
              </a>
            </div>
          )}
          {project.ecsServiceName && (
            <div className="detail-info-item">
              <span className="detail-info-label"><Server size={12} /> ECS Service</span>
              <span className="detail-info-value mono">{project.ecsServiceName}</span>
            </div>
          )}
          {project.ecsTaskFamily && (
            <div className="detail-info-item">
              <span className="detail-info-label"><Hash size={12} /> Task Family</span>
              <span className="detail-info-value mono">{project.ecsTaskFamily}</span>
            </div>
          )}
          {latestDep?.databaseName && (
            <div className="detail-info-item">
              <span className="detail-info-label"><Database size={12} /> Database</span>
              <span className="detail-info-value mono">{latestDep.databaseName}</span>
            </div>
          )}
          {latestDep?.commitSha && (
            <div className="detail-info-item">
              <span className="detail-info-label"><Hash size={12} /> Commit</span>
              <span className="detail-info-value mono">{shortSha(latestDep.commitSha)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Deployments + Detail split */}
      <div className="detail-split">
        {/* Left: deployment list */}
        <div className="deployments-section">
          <div className="section-header">
            <h2 className="section-title">Deployment History</h2>
            <span className="section-count">{project.deployments.length}</span>
          </div>
          {project.deployments.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 24px' }}>
              <p>No deployments yet. Trigger the first one above.</p>
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

        {/* Right: detail panel */}
        {selectedDep && (
          <div className="detail-panel-col">
            <DeploymentDetailPanel dep={selectedDep} />
          </div>
        )}
      </div>
    </div>
  );
}
