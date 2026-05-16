import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, RefreshCw, ExternalLink, GitBranch,
  GitCommit, Clock, Rocket, AlertCircle,
} from 'lucide-react';
import { projectsApi, deploymentsApi, type Project } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { timeAgo, shortSha, repoName } from '../lib/utils';
import { CreateProjectModal } from '../components/CreateProjectModal';
import './ProjectsPage.css';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deploying, setDeploying] = useState<Record<string, boolean>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await projectsApi.list();
      setProjects(res.data);
      setError('');
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDeploy(projectId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeploying(d => ({ ...d, [projectId]: true }));
    try {
      await deploymentsApi.deploy(projectId);
      await load(true);
    } catch {
      // silently handled
    } finally {
      setDeploying(d => ({ ...d, [projectId]: false }));
    }
  }

  const activeCount = projects.filter(p =>
    p.latestDeployment && !p.latestDeployment.isTerminal
  ).length;

  return (
    <div className="projects-page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Projects</h1>
          <div className="page-header-meta">
            {loading ? null : (
              <>
                <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
                {activeCount > 0 && (
                  <span className="active-badge">
                    <span className="pulse-dot" style={{ background: 'var(--blue)', width: 5, height: 5 }} />
                    {activeCount} deploying
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => load(true)}
            disabled={refreshing}
            title="Refresh"
          >
            <RefreshCw size={13} strokeWidth={2} className={refreshing ? 'spin-anim' : ''} />
            Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={13} strokeWidth={2.5} />
            New Project
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="projects-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton proj-skeleton-item" style={{ animationDelay: `${i * 0.07}s` }} />
          ))}
        </div>
      ) : error ? (
        <div className="projects-error">
          <AlertCircle size={18} strokeWidth={2} style={{ color: 'var(--red)', flexShrink: 0 }} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => load()}>Retry</button>
        </div>
      ) : projects.length === 0 ? (
        <div className="projects-empty">
          <div className="projects-empty-icon">
            <Rocket size={28} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
          </div>
          <h3>No projects yet</h3>
          <p>Connect a GitHub repo and deploy it to AWS ECS in minutes.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={13} />
            Create first project
          </button>
        </div>
      ) : (
        <div className="projects-table fade-up">
          {/* Table header */}
          <div className="proj-table-head">
            <span>Project</span>
            <span>Status</span>
            <span>Commit</span>
            <span>Updated</span>
            <span></span>
          </div>

          {/* Project rows */}
          {projects.map((project, i) => {
            const dep = project.latestDeployment;
            const isActive = dep && !dep.isTerminal;
            return (
              <div
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="proj-row"
                style={{ animationDelay: `${i * 0.04}s`, cursor: 'pointer' }}
              >
                {/* Project identity */}
                <div className="proj-row-identity">
                  <div className="proj-row-name-wrap">
                    <span className="proj-row-name">{project.name}</span>
                    {project.publicUrl && (
                      <a
                        href={project.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="proj-row-url"
                        onClick={e => e.stopPropagation()}
                        title={project.publicUrl}
                      >
                        <ExternalLink size={11} strokeWidth={2} />
                        {project.publicUrl.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  <span className="proj-row-repo info-row">
                    <GitBranch size={11} strokeWidth={2} />
                    {repoName(project.repoUrl)}
                    <span style={{ color: 'var(--text-muted)', fontSize: '.68rem' }}>· {project.branch}</span>
                  </span>
                </div>

                {/* Status */}
                <div className="proj-row-status">
                  {dep ? (
                    <StatusBadge status={dep.status} size="sm" />
                  ) : (
                    <span className="badge badge-neutral" style={{ fontSize: '.64rem' }}>Not deployed</span>
                  )}
                  {dep?.phaseLabel && isActive && (
                    <span className="proj-phase-label">{dep.phaseLabel}</span>
                  )}
                </div>

                {/* Commit */}
                <div className="proj-row-commit">
                  {dep?.commitSha ? (
                    <span className="chip">
                      <GitCommit size={10} strokeWidth={2} />
                      {shortSha(dep.commitSha)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>—</span>
                  )}
                </div>

                {/* Time */}
                <div className="proj-row-time info-row">
                  <Clock size={11} strokeWidth={2} />
                  {dep ? timeAgo(dep.updatedAt) : timeAgo(project.createdAt)}
                </div>

                {/* Actions */}
                <div className="proj-row-actions" onClick={e => e.preventDefault()}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => handleDeploy(project.id, e)}
                    disabled={deploying[project.id] || (dep && !dep.isTerminal) || false}
                    title="Trigger deployment"
                  >
                    {deploying[project.id]
                      ? <span className="spinner" />
                      : <RefreshCw size={12} strokeWidth={2} />}
                    Deploy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void load(); }}
        />
      )}
    </div>
  );
}
