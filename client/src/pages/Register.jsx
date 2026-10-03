import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Register() {
   const { register, firebaseConfigured } = useAuth();

  

  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.email, form.password, form.displayName);
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
        <h1>{t.register}</h1>
        <p className="muted">{t.brand}</p>
        {!firebaseConfigured && (
          <div className="alert alert-warn">Configure Firebase in client/.env to enable registration.</div>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>{t.displayName}</label>
            <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>{t.email}</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>{t.password}</label>
            <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <button className="btn btn-block" disabled={loading || !firebaseConfigured}>
            {loading ? t.loading : t.register}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Already have an account? <Link to="/login">{t.login}</Link>
        </p>
      </div>
    </div>
  );
}
