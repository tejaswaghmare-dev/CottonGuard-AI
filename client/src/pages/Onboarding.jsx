import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const ROLES = [
  { id: 'farmer', key: 'farmer' },
  { id: 'pesticide_owner', key: 'pesticideOwner' },
  { id: 'leaf_doctor', key: 'leafDoctor' },
];

export default function Onboarding() {
  const { user, profile, completeProfile, loading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [role, setRole] = useState('farmer');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState('');
  const [extra, setExtra] = useState({ location: '', shopName: '', expertise: 'Cotton diseases', consultationFee: 299 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) return <div className="container page">{t.loading}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.role) {
    const home =
      profile.role === 'farmer' ? '/dashboard' :
      profile.role === 'pesticide_owner' ? '/owner' : '/doctor';
    return <Navigate to={home} replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await completeProfile({
        role,
        displayName,
        phone,
        location: extra.location,
        shopName: extra.shopName,
        expertise: extra.expertise,
        consultationFee: extra.consultationFee,
      });
      const home = role === 'farmer' ? '/dashboard' : role === 'pesticide_owner' ? '/owner' : '/doctor';
      navigate(home);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hero-auth">
      <div className="card auth-panel" style={{ width: 'min(520px, 100%)' }}>
        <h1>{t.selectRole}</h1>
        <p className="muted">Complete your CottonGuard AI profile</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="role-pills">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`role-pill ${role === r.id ? 'active' : ''}`}
                onClick={() => setRole(r.id)}
              >
                <strong>{t[r.key]}</strong>
              </button>
            ))}
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>{t.displayName}</label>
            <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="form-group">
            <label>{t.location}</label>
            <input value={extra.location} onChange={(e) => setExtra({ ...extra, location: e.target.value })} placeholder="Pune, Maharashtra" />
          </div>
          {role === 'pesticide_owner' && (
            <div className="form-group">
              <label>Shop name</label>
              <input value={extra.shopName} onChange={(e) => setExtra({ ...extra, shopName: e.target.value })} />
            </div>
          )}
          {role === 'leaf_doctor' && (
            <>
              <div className="form-group">
                <label>Expertise</label>
                <input value={extra.expertise} onChange={(e) => setExtra({ ...extra, expertise: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Consultation fee (₹)</label>
                <input type="number" value={extra.consultationFee} onChange={(e) => setExtra({ ...extra, consultationFee: e.target.value })} />
              </div>
            </>
          )}
          <button className="btn btn-block" disabled={saving}>{saving ? t.loading : t.save}</button>
        </form>
      </div>
    </div>
  );
}
