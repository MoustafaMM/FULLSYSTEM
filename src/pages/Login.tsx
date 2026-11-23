import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HOME_BY_ROLE } from '../lib/roles';

export default function Login() {
  const { login, resetPassword, profile, error: authError, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!loading && profile) return <Navigate to={HOME_BY_ROLE[profile.role]} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try { await login(email, password); }
    catch { setErr('Incorrect email or password.'); }
    finally { setBusy(false); }
  }

  async function reset() {
    if (!email) { setErr('Enter your email first.'); return; }
    try { await resetPassword(email); setMsg('Password reset email sent.'); }
    catch { setErr('Could not send reset email.'); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.png" alt="" className="login-logo" />
        <h1>Express Tracker</h1>
        <p className="muted">Student pipeline · Visa tracking · Logistics</p>
        {(err || authError) && <div className="alert alert-error">{err || authError}</div>}
        {msg && <div className="alert alert-ok">{msg}</div>}
        <label className="field"><span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field"><span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="link" onClick={reset}>Forgot password?</button>
      </form>
    </div>
  );
}
