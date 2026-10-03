import { NavLink, Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Navbar() {
  const { user, profile, logout, role } = useAuth();
  const { t, lang, setLang } = useLanguage();

  const farmerLinks = [
    { to: '/dashboard', label: t.dashboard },
    { to: '/farms', label: t.nav.farms },
    { to: '/detect', label: t.nav.detect },
    { to: '/doctors', label: t.nav.doctors },
    { to: '/consultations', label: t.nav.consultations },
    { to: '/products', label: t.nav.products },
  ];

  const ownerLinks = [
    { to: '/owner', label: t.dashboard },
    { to: '/owner/products', label: t.products },
  ];

  const doctorLinks = [
    { to: '/doctor', label: t.dashboard },
    { to: '/doctor/consultations', label: t.consultations },
    { to: '/doctor/availability', label: t.availableSlots },
  ];

  const links =
    role === 'pesticide_owner' ? ownerLinks : role === 'leaf_doctor' ? doctorLinks : farmerLinks;

  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Link to={user ? (role === 'farmer' ? '/dashboard' : role === 'pesticide_owner' ? '/owner' : role === 'leaf_doctor' ? '/doctor' : '/onboarding') : '/'} className="brand">
          <div className="brand-mark"><Leaf size={20} /></div>
          <span>{t.brand}</span>
        </Link>

        {user && profile?.role && (
          <nav className="nav-links">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="lang-toggle">
            <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              EN
            </button>
            <button type="button" className={lang === 'mr' ? 'active' : ''} onClick={() => setLang('mr')}>
              मराठी
            </button>
          </div>
          {user ? (
            <button type="button" className="ghost-btn" onClick={logout}>{t.logout}</button>
          ) : (
            <Link className="btn" to="/login">{t.login}</Link>
          )}
        </div>
      </div>
    </header>
  );
}
