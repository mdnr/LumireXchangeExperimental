import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'seller' | 'user'>(searchParams.get('role') === 'seller' ? 'seller' : 'user');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, displayName, role);
      navigate(from && from !== '/register' ? from : '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container auth-container">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Join Lumière</h1>
        <p className="muted">Create an account to start shopping.</p>

        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <label className="field">
          <span>Display name</span>
          <input
            type="text"
            required
            minLength={2}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ada Lovelace"
          />
        </label>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        <fieldset className="role-picker">
          <legend>Account type</legend>
          <label className={role === 'user' ? 'role-option active' : 'role-option'}>
            <input type="radio" name="role" checked={role === 'user'} onChange={() => setRole('user')} />
            <span><strong>Buyer</strong><small>Browse and order products.</small></span>
          </label>
          <label className={role === 'seller' ? 'role-option active' : 'role-option'}>
            <input type="radio" name="role" checked={role === 'seller'} onChange={() => setRole('seller')} />
            <span><strong>Seller</strong><small>List products with 3D models.</small></span>
          </label>
        </fieldset>

        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="muted small">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}