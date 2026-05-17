import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { githubApi, type AuthUser } from '../lib/api';

export function GithubAuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setSession } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');

    if (!token || !userParam) {
      window.location.href = '/login?github=error';
      return;
    }

    const callbackToken = token;
    const callbackUserParam = userParam;

    async function completeGithubSetup() {
      try {
        const normalized = callbackUserParam.replace(/-/g, '+').replace(/_/g, '/');
        const padding =
          normalized.length % 4 === 0
            ? ''
            : '='.repeat(4 - (normalized.length % 4));
        const parsedUser = JSON.parse(
          atob(`${normalized}${padding}`),
        ) as AuthUser;
        setSession(callbackToken, parsedUser);

        const connectionRes = await githubApi.getConnection();

        if (!connectionRes.data.isEmailVerified) {
          if (!cancelled) {
            navigate('/?verify=required', { replace: true });
          }
          return;
        }

        const installationsRes = await githubApi
          .listInstallations()
          .catch(() => ({ data: [] as Array<{ id: string }> }));

        if (!cancelled) {
          if (
            installationsRes.data.length === 0 &&
            connectionRes.data.installUrl
          ) {
            navigate('/integrations?setup=app', { replace: true });
          } else {
            navigate('/?github=connected', { replace: true });
          }
        }
      } catch {
        window.location.href = '/login?github=error';
      }
    }

    void completeGithubSetup();

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, setSession]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );
}
