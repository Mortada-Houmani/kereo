import { useEffect, useState } from 'react';
import { ExternalLink, GitBranch, RefreshCw } from 'lucide-react';
import {
  authApi,
  githubApi,
  type GithubConnectionInfo,
  type GithubInstallation,
} from '../lib/api';

export function IntegrationsPage() {
  const [connection, setConnection] = useState<GithubConnectionInfo | null>(null);
  const [installations, setInstallations] = useState<GithubInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [connectionRes, installationsRes] = await Promise.all([
        githubApi.getConnection(),
        githubApi.listInstallations().catch(() => ({ data: [] as GithubInstallation[] })),
      ]);
      setConnection(connectionRes.data);
      setInstallations(installationsRes.data);
    } catch {
      setError('Failed to load GitHub integration');
    } finally {
      setLoading(false);
    }
  }

  async function handleGithubConnect() {
    const res = await authApi.getGithubAuthUrl();
    window.location.href = res.data.url;
  }

  return (
    <div className="projects-page">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Integrations</h1>
          <div className="page-header-meta">
            <span>Connect GitHub and manage repo visibility</span>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} strokeWidth={2} className={loading ? 'spin-anim' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="section-label" style={{ marginBottom: 6 }}>
              <GitBranch size={12} /> GitHub
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
              Sign in with GitHub to scope repository access to your account.
            </div>
          </div>
          {connection?.installUrl ? (
            <a className="btn btn-primary btn-sm" href={connection.installUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={12} strokeWidth={2} />
              Install GitHub App
            </a>
          ) : null}
        </div>

        {error ? (
          <div className="projects-error">{error}</div>
        ) : (
          <>
          <div style={{ color: 'var(--text-secondary)', fontSize: '.85rem' }}>
              Status:{' '}
              <strong>
                {connection?.connected
                  ? `Connected as ${connection.githubLogin}`
                  : 'Not connected'}
              </strong>
            </div>
            {!connection?.connected ? (
              <button className="btn btn-primary btn-sm" onClick={() => void handleGithubConnect()}>
                Connect GitHub account
              </button>
            ) : null}

            <div style={{ display: 'grid', gap: 8 }}>
              {installations.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
                  No visible installations yet.
                </div>
              ) : (
                installations.map((installation) => (
                  <div
                    key={installation.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{installation.accountLogin}</div>
                    <div className="mono">Installation {installation.id}</div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
