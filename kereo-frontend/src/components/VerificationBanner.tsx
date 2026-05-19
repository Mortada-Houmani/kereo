import { useState } from 'react';
import { AlertTriangle, Mail } from 'lucide-react';
import { authApi } from '../lib/api';
import { useAuth } from '../contexts/useAuth';

export function VerificationBanner() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  if (!user || user.isEmailVerified) {
    return null;
  }

  async function handleResend() {
    const email = user?.email;

    if (!email) {
      return;
    }

    setSending(true);
    setMessage('');
    try {
      const res = await authApi.resendVerification(email);
      setMessage(
        res.data.verificationEmailSent === false
          ? res.data.verificationEmailError ||
              'Account exists, but the verification email could not be sent yet.'
          : 'Verification email sent.',
      );
    } catch {
      setMessage('Failed to resend verification email.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="verification-banner">
      <div className="verification-banner-copy">
        <AlertTriangle size={15} strokeWidth={2} />
        <span>Verify your email to create projects, deploy, and manage integrations.</span>
      </div>
      <div className="verification-banner-actions">
        {message ? <span className="verification-banner-message">{message}</span> : null}
        <button className="btn btn-ghost btn-sm" onClick={handleResend} disabled={sending}>
          {sending ? <span className="spinner" /> : <Mail size={12} strokeWidth={2} />}
          Resend email
        </button>
      </div>
    </div>
  );
}
