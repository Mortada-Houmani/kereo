import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Rocket, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';
import { authApi } from '../lib/api';
import './AuthPage.css';

type Mode = 'login' | 'register';

export function AuthPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, confirmPassword);
        setNotice('Account created. Check your inbox to verify your email.');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Something went wrong';
      setError(Array.isArray(msg) ? msg[0] : String(msg));
    } finally {
      setLoading(false);
    }
  }

  async function handleGithubLogin() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await authApi.getGithubAuthUrl();
      window.location.href = res.data.url;
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to start GitHub sign-in';
      setError(Array.isArray(msg) ? msg[0] : String(msg));
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email) {
      setError('Enter your email first');
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);
    try {
      await authApi.resendVerification(email);
      setNotice('Verification email sent. Check your inbox.');
    } catch {
      setError('Failed to resend verification email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-grid" />
      <div className="auth-card fade-in">
        <div className="auth-logo">
          <Rocket size={22} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
          <span>Kereo</span>
        </div>
        <h1 className="auth-title">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Sign in to your deployment platform'
            : 'Start deploying to AWS ECS in minutes'}
        </p>

        <button
          type="button"
          className="btn btn-ghost auth-github-btn"
          onClick={handleGithubLogin}
          disabled={loading}
        >
          Continue with GitHub
        </button>

        <div className="auth-separator">
          <span>or</span>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          {mode === 'register' && (
            <div className="field">
              <label className="label" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          )}
          {error && <p className="field-error">{error}</p>}
          {notice && <p className="field-hint" style={{ color: 'var(--green)' }}>{notice}</p>}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px 18px' }}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : null}
            {mode === 'login' ? 'Sign in' : 'Create account'}
            {!loading && <ArrowRight size={15} strokeWidth={2.2} />}
          </button>
        </form>

        <button
          type="button"
          className="auth-inline-action"
          onClick={handleResendVerification}
          disabled={loading}
        >
          Resend verification email
        </button>

        <p className="auth-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          {' '}
          <Link
            to="#"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </Link>
        </p>
      </div>
    </div>
  );
}
