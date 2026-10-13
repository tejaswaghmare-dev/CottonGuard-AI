
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Register() {
  const { register, firebaseConfigured } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function updateField(e) {
    setForm((previous) => ({
      ...previous,
      [e.target.name]: e.target.value,
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }

    if (form.password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      await register(form.email.trim(), form.password, form.displayName.trim());
      navigate('/onboarding');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="cg-auth-page">
      <section className="cg-auth-shell cg-register-shell">
        <aside className="cg-auth-visual cg-register-visual">
          <div className="cg-visual-top">
            <Link to="/" className="cg-brand">
              <span className="cg-brand-icon">🌿</span>
              <span>
                CottonGuard
                <small>AI CROP INTELLIGENCE</small>
              </span>
            </Link>

            <span className="cg-visual-tag">SMART FARMING</span>
          </div>

          <div className="cg-visual-content">
            <span className="cg-eyebrow">GROW SMARTER WITH AI</span>
            <h1>Your farm.<br />Your future.<br /><span>Protected.</span></h1>
            <p>
              Join CottonGuard AI to monitor crop health, detect cotton leaf
              diseases, and get smarter crop-care guidance.
            </p>

            <div className="cg-visual-points">
              <div><span>✓</span> AI-powered leaf disease detection</div>
              <div><span>✓</span> Farm health insights in one place</div>
              <div><span>✓</span> Practical crop-care recommendations</div>
            </div>
          </div>

          <div className="cg-visual-footer">
            <span>🌱</span>
            <p>Better insights today. Healthier harvests tomorrow.</p>
          </div>
        </aside>

        <section className="cg-auth-form-side">
          <div className="cg-mobile-brand">
            <span>🌿</span> CottonGuard AI
          </div>

          <div className="cg-auth-form-wrap">
            <div className="cg-form-heading">
              <span className="cg-form-kicker">CREATE YOUR ACCOUNT</span>
              <h2>Join the growing community</h2>
              <p>Enter your details to get started with CottonGuard AI.</p>
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
                <label htmlFor="register-name">Full name</label>
                <input
                  id="register-name"
                  name="displayName"
                  type="text"
                  placeholder="Enter your full name"
                  autoComplete="name"
                  value={form.displayName}
                  onChange={updateField}
                  required
                  maxLength={100}
                />
              </div>

              <div className="cg-field">
                <label htmlFor="register-email">Email address</label>
                <input
                  id="register-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={form.email}
                  onChange={updateField}
                  required
                />
              </div>

              <div className="cg-field">
                <label htmlFor="register-password">Password</label>
                <div className="cg-password-wrap">
                  <input
                    id="register-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={updateField}
                    minLength={6}
                    required
                  />
                  <button
                    className="cg-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="cg-field">
                <label htmlFor="register-confirm-password">Confirm password</label>
                <div className="cg-password-wrap">
                  <input
                    id="register-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Enter your password again"
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={updateField}
                    required
                  />
                  <button
                    className="cg-password-toggle"
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                className="cg-submit-btn"
                type="submit"
                disabled={loading || !firebaseConfigured}
              >
                {loading ? 'Creating account...' : 'Create account'}
                {!loading && <span>→</span>}
              </button>
            </form>

            <p className="cg-auth-switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>

            <p className="cg-auth-legal">
              By creating an account, you agree to use CottonGuard AI responsibly.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
