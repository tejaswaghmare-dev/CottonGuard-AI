import { NavLink } from 'react-router-dom';
import { Home, MapPinned, ScanLine, Stethoscope, Package } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function MobileNav() {
  const { role } = useAuth();
  const { t } = useLanguage();
  if (role !== 'farmer') return null;

  const items = [
    { to: '/dashboard', icon: Home, label: t.nav.home },
    { to: '/farms', icon: MapPinned, label: t.nav.farms },
    { to: '/detect', icon: ScanLine, label: t.nav.detect },
    { to: '/doctors', icon: Stethoscope, label: t.nav.doctors },
    { to: '/products', icon: Package, label: t.nav.products },
  ];

  return (
    <nav className="mobile-nav">
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
