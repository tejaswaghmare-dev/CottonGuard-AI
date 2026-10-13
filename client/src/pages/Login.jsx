
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Login() {
  const { login, firebaseConfigured } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email.trim(), password);
      navigate('/onboarding');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="cg-auth-page">
      <section className="cg-auth-shell">
        {/* Left panel with your team image */}
        <aside className="cg-auth-visual cg-login-visual">
          <Link to="/" className="cg-brand">
            <span className="cg-brand-icon">🌿</span>
            <span>
              CottonGuard
              <small>AI CROP INTELLIGENCE</small>
            </span>
          </Link>

          <div className="cg-login-caption">
            <h1>
              Grow
              <br />
              <span>Smarter.</span>
            </h1>
          </div>
        </aside>

        {/* Right login form */}
        <section className="cg-auth-form-side">
          <div className="cg-auth-form-wrap">
            <div className="cg-form-heading">
              <span className="cg-form-kicker">WELCOME BACK</span>
              <h2>{t.login || 'Sign in'}</h2>
              <p>Access your account.</p>
            </div>

            {!firebaseConfigured && (
              <div className="cg-alert cg-alert-warning">
                Firebase is not configured. Check your client/.env settings.
              </div>
            )}

            {error && (
              <div className="cg-alert cg-alert-error" role="alert">
                {error}
              </div>
            )}

            <form className="cg-auth-form" onSubmit={onSubmit}>
              <div className="cg-field">
                <label htmlFor="login-email">
                  {t.email || 'Email address'}
                </label>

                <input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="cg-field">
                <label htmlFor="login-password">
                  {t.password || 'Password'}
                </label>

                <div className="cg-password-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />

                  <button
                    className="cg-password-toggle"
                    type="button"
                    onClick={() =>
                      setShowPassword((previous) => !previous)
                    }
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                className="cg-submit-btn"
                type="submit"
                disabled={loading || !firebaseConfigured}
              >
                {loading ? 'Signing in...' : 'Sign in'}
                {!loading && <span>→</span>}
              </button>
            </form>

            <p className="cg-auth-switch">
              New here? <Link to="/register">Create an account</Link>
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
