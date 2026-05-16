import { useState } from 'react';
import { X, Loader2, GitBranch, Terminal, Globe, Server, AlertTriangle } from 'lucide-react';
import { projectsApi, type CreateProjectDto } from '../lib/api';
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
};

export function CreateProjectModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CreateProjectDto>(defaults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(key: keyof CreateProjectDto, value: string | number) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await projectsApi.create({
        ...form,
        port: Number(form.port),
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
              <div className="form-grid">
                <div className="field">
                  <label className="label" htmlFor="proj-repo">
                    <Globe size={11} style={{ marginRight: 4 }} />
                    GitHub Repository URL
                  </label>
                  <input
                    id="proj-repo"
                    value={form.repoUrl}
                    onChange={e => set('repoUrl', e.target.value)}
                    placeholder="https://github.com/org/repo"
                    required
                    disabled={loading}
                  />
                  <span className="field-hint">Public repository for now.</span>
                </div>

                <div className="field">
                  <label className="label" htmlFor="proj-branch">
                    <GitBranch size={11} style={{ marginRight: 4 }} />
                    Default Branch
                  </label>
                  <input
                    id="proj-branch"
                    value={form.branch}
                    onChange={e => set('branch', e.target.value)}
                    placeholder="main"
                    disabled={loading}
                  />
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
                  <input
                    id="proj-port"
                    type="number"
                    value={form.port}
                    onChange={e => set('port', e.target.value)}
                    placeholder="3000"
                    disabled={loading}
                  />
                  <span className="field-hint">Traffic is routed here.</span>
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

                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label className="label" htmlFor="proj-context">Build Context</label>
                  <input
                    id="proj-context"
                    value={form.buildContext}
                    onChange={e => set('buildContext', e.target.value)}
                    placeholder="."
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Warning Box */}
            <div className="modal-warning">
              <AlertTriangle size={14} style={{ color: 'var(--yellow)', flexShrink: 0 }} />
              <p>
                Kereo will provision an ECS Service, CloudWatch logs, and an RDS database. 
                Initial setup takes about 20s.
              </p>
            </div>

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
