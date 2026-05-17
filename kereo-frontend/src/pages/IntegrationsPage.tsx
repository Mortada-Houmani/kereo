import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, GitBranch, RefreshCw } from 'lucide-react';
import {
  authApi,
  githubApi,
  type GithubConnectionInfo,
  type GithubInstallation,
} from '../lib/api';

export function IntegrationsPage() {
  const [searchParams] = useSearchParams();
  const [connection, setConnection] = useState<GithubConnectionInfo | null>(null);
  const [installations, setInstallations] = useState<GithubInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const needsAppSetup = searchParams.get('setup') === 'app';
  const githubInstallationId = searchParams.get('installation_id');
  const githubSetupAction = searchParams.get('setup_action');
  const hasRepositoryAccess = installations.length > 0;
  const returnedFromGithubInstall =
    Boolean(githubInstallationId) &&
    (githubSetupAction === 'install' || githubSetupAction === 'update');
  const statusLabel = useMemo(() => {
    if (!connection?.connected) return 'GitHub account not connected';
    if (!connection.isEmailVerified) return 'Verify your email to continue';
    if (!hasRepositoryAccess) return 'Repository access not granted yet';
    return `Connected as ${connection.githubLogin}`;
  }, [connection, hasRepositoryAccess]);

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
              Grant Repository Access
            </a>
          ) : null}
        </div>

        {error ? (
          <div className="projects-error">{error}</div>
        ) : (
          <>
            {returnedFromGithubInstall ? (
              <div
                style={{
                  border: '1px solid color-mix(in srgb, var(--green) 35%, var(--border))',
                  background: 'color-mix(in srgb, var(--green) 10%, transparent)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 600 }}>GitHub access updated</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '.82rem' }}>
                  GitHub sent you back after updating the Kereo app installation.
                  {hasRepositoryAccess
                    ? ' Your repositories are ready to use.'
                    : ' If the repo list still looks empty, give it a quick refresh.'}
                </div>
              </div>
            ) : null}

            {needsAppSetup && connection?.connected && !hasRepositoryAccess ? (
              <div
                style={{
                  border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))',
                  background: 'color-mix(in srgb, var(--accent) 9%, transparent)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ fontWeight: 600 }}>Finish GitHub setup</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '.82rem' }}>
                  Your account is connected. The last step is granting the Kereo GitHub App
                  access to the repositories you want to deploy.
                </div>
                {connection.installUrl ? (
                  <div>
                    <a className="btn btn-primary btn-sm" href={connection.installUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} strokeWidth={2} />
                      Grant Repository Access
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ color: 'var(--text-secondary)', fontSize: '.85rem' }}>
              Status:{' '}
              <strong>{statusLabel}</strong>
            </div>
            {!connection?.connected ? (
              <button className="btn btn-primary btn-sm" onClick={() => void handleGithubConnect()}>
                Connect GitHub account
              </button>
            ) : null}

            {connection?.connected && !hasRepositoryAccess && connection.installUrl ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
                Repositories appear in Kereo only after the GitHub App is installed on them.
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 8 }}>
              {installations.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>
                  No repositories are ready yet.
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
