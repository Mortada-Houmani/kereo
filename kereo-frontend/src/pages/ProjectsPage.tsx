import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, RefreshCw, ExternalLink, GitBranch,
  GitCommit, Clock, ChevronRight, Boxes,
} from 'lucide-react';
import { projectsApi, deploymentsApi, type Project } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { timeAgo, shortSha, repoName } from '../lib/utils';
import { CreateProjectModal } from '../components/CreateProjectModal';
import './ProjectsPage.css';

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deploying, setDeploying] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await projectsApi.list();
      setProjects(res.data);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDeploy(projectId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeploying(d => ({ ...d, [projectId]: true }));
    try {
      await deploymentsApi.deploy(projectId);
      await load();
    } catch {
      // silently handled
    } finally {
      setDeploying(d => ({ ...d, [projectId]: false }));
    }
  }

  return (
    <div className="projects-page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">{projects.length} project{projects.length !== 1 ? 's' : ''} deployed to AWS ECS</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={load} title="Refresh">
            <RefreshCw size={14} strokeWidth={2} />
            Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} strokeWidth={2.5} />
            New Project
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="projects-skeleton">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 110, borderRadius: 'var(--radius)' }} />
          ))}
        </div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: 'var(--red)' }}>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={load}>Try again</button>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <Boxes size={40} />
          <h3>No projects yet</h3>
          <p>Create a project from a GitHub repo to get started.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            New Project
          </button>
        </div>
      ) : (
        <div className="projects-list fade-in">
          {projects.map(project => {
            const dep = project.latestDeployment;
            return (
              <Link key={project.id} to={`/projects/${project.id}`} className="project-card card card-hover">
                {/* Top row */}
                <div className="project-card-top">
                  <div className="project-card-identity">
                    <span className="project-name">{project.name}</span>
                    <span className="project-repo mono">
                      <GitBranch size={11} strokeWidth={2} />
                      {repoName(project.repoUrl)}
                    </span>
                  </div>
                  <div className="project-card-actions">
                    {dep && <StatusBadge status={dep.status} size="sm" />}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => handleDeploy(project.id, e)}
                      disabled={deploying[project.id]}
                      title="Trigger deploy"
                    >
                      {deploying[project.id]
                        ? <span className="spinner" />
                        : <RefreshCw size={13} strokeWidth={2} />}
                      Deploy
                    </button>
                    <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>

                {/* Bottom row */}
                <div className="project-card-bottom">
                  {project.publicUrl && (
                    <a
                      href={project.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="project-url"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink size={11} strokeWidth={2} />
                      {project.publicUrl.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {dep?.commitSha && (
                    <span className="mono project-meta-item">
                      <GitCommit size={11} strokeWidth={2} />
                      {shortSha(dep.commitSha)}
                    </span>
                  )}
                  {dep?.phaseLabel && (
                    <span className="project-meta-item" style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>
                      {dep.phaseLabel}
                    </span>
                  )}
                  <span className="project-meta-item mono" style={{ marginLeft: 'auto' }}>
                    <Clock size={11} strokeWidth={2} />
                    {dep ? timeAgo(dep.updatedAt) : timeAgo(project.createdAt)}
                  </span>
                </div>
              </Link>
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
