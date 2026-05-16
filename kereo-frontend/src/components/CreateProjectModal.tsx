import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
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
      <div className="modal-panel fade-in">
        <div className="modal-header">
          <h2 className="modal-title">New Project</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label" htmlFor="proj-name">Project Name *</label>
              <input
                id="proj-name"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="my-app"
                required
              />
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label" htmlFor="proj-repo">GitHub Repo URL *</label>
              <input
                id="proj-repo"
                value={form.repoUrl}
                onChange={e => set('repoUrl', e.target.value)}
                placeholder="https://github.com/your-org/my-app"
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="proj-branch">Branch</label>
              <input
                id="proj-branch"
                value={form.branch}
                onChange={e => set('branch', e.target.value)}
                placeholder="main"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="proj-port">Port</label>
              <input
                id="proj-port"
                type="number"
                value={form.port}
                onChange={e => set('port', e.target.value)}
                placeholder="3000"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="proj-dockerfile">Dockerfile Path</label>
              <input
                id="proj-dockerfile"
                value={form.dockerfilePath}
                onChange={e => set('dockerfilePath', e.target.value)}
                placeholder="Dockerfile"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="proj-context">Build Context</label>
              <input
                id="proj-context"
                value={form.buildContext}
                onChange={e => set('buildContext', e.target.value)}
                placeholder="."
              />
            </div>
          </div>

          <div className="modal-info">
            <span style={{ color: 'var(--yellow)', fontSize: '.75rem', fontWeight: 500 }}>⚡</span>
            <p>
              Creating a project will provision an ECS service, target group, CloudWatch log group,
              and SSM parameter on AWS. This may take 15–30 seconds.
            </p>
          </div>

          {error && <p className="field-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={15} className="spin-icon" /> : null}
              {loading ? 'Provisioning AWS…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
