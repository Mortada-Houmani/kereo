import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );
  const [message, setMessage] = useState(
    token ? 'Verifying your email...' : 'Verification token is missing.',
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    authApi
      .verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Email verified. You can continue using Kereo.');
      })
      .catch((error: unknown) => {
        const msg =
          (error as { response?: { data?: { message?: string | string[] } } })
            ?.response?.data?.message ?? 'Verification failed.';
        setStatus('error');
        setMessage(Array.isArray(msg) ? msg[0] : String(msg));
      });
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card fade-in">
        <h1 className="auth-title">
          {status === 'loading'
            ? 'Verifying email'
            : status === 'success'
              ? 'Email verified'
              : 'Verification failed'}
        </h1>
        <p className="auth-subtitle">{message}</p>
        <Link to="/" className="btn btn-primary" style={{ justifyContent: 'center' }}>
          Back to app
        </Link>
      </div>
    </div>
  );
}
