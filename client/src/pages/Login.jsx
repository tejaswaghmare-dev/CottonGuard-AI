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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/onboarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hero-auth">
      <div className="card auth-panel">
        <h1>{t.login}</h1>
        <p className="muted">{t.brand}</p>
        {!firebaseConfigured && (
          <div className="alert alert-warn">Configure Firebase in client/.env to enable login.</div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>{t.email}</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t.password}</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-block" disabled={loading || !firebaseConfigured}>
            {loading ? t.loading : t.login}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          New here? <Link to="/register">{t.register}</Link>
        </p>
      </div>
    </div>
  );
}
