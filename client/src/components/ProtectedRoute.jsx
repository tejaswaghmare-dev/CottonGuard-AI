import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles }) {
  const { user, profile, loading, firebaseConfigured } = useAuth();

  if (!firebaseConfigured) {
    return (
      <div className="container page">
        <div className="alert alert-warn">
          Firebase is not configured. Copy <code>client/.env.example</code> to <code>client/.env</code> and add your Firebase web keys.
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="container page"><p className="muted">Loading…</p></div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!profile?.role) return <Navigate to="/onboarding" replace />;

  if (roles && !roles.includes(profile.role)) {
    const home =
      profile.role === 'farmer' ? '/dashboard' :
      profile.role === 'pesticide_owner' ? '/owner' : '/doctor';
    return <Navigate to={home} replace />;
  }

  return <Outlet />;
}
