import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { t } = useLanguage();
  const { user, role } = useAuth();
  const home =
    role === 'farmer' ? '/dashboard' :
    role === 'pesticide_owner' ? '/owner' :
    role === 'leaf_doctor' ? '/doctor' : '/onboarding';

  return (
    <div className="page">
      <div className="container">
        <section className="result-hero" style={{ padding: '2.5rem 1.75rem', marginTop: '1rem' }}>
          <p className="muted" style={{ marginTop: 0 }}>🌱 Agriculture × AI</p>
          <h1 className="display" style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)' }}>{t.brand}</h1>
          <p style={{ maxWidth: 560, fontSize: '1.1rem', color: 'var(--ink-muted)' }}>
            {t.tagline}. Farm management, cotton disease detection, severity analysis, explainable AI,
            farm spread estimates, verified products, Leaf Doctor video consults, and Marathi voice chat —
            in one workflow.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
            {user ? (
              <Link className="btn btn-lg" to={home}>{t.dashboard}</Link>
            ) : (
              <>
                <Link className="btn btn-lg" to="/register">{t.register}</Link>
                <Link className="btn btn-secondary btn-lg" to="/login">{t.login}</Link>
              </>
            )}
          </div>
        </section>

        <div className="grid grid-3" style={{ marginTop: '1.5rem' }}>
          {[
            { title: 'Detect & Explain', body: 'YOLOv8 + EfficientNetB0 + Grad-CAM for leaf disease, severity, and attention maps.' },
            { title: 'Farm-level insight', body: 'Estimated disease spread from multiple samples — clearly labeled, never overclaimed.' },
            { title: 'Expert + marketplace', body: '5 free Leaf Doctor Meet calls/month, Gemini advice, verified pesticide catalogue.' },
          ].map((c) => (
            <div className="card" key={c.title}>
              <h3>{c.title}</h3>
              <p className="muted">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
