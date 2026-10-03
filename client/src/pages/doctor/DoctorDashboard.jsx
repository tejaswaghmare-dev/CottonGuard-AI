import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { consultationsApi } from '../../services/api';

export default function DoctorDashboard() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [list, setList] = useState([]);

  useEffect(() => {
    consultationsApi.list().then((d) => setList(d.consultations || []));
  }, []);

  const pending = list.filter((c) => ['pending', 'confirmed', 'awaiting_payment'].includes(c.status)).length;

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <div>
            <h1>{t.dashboard}</h1>
            <p className="muted">Dr. {profile?.displayName}</p>
          </div>
          <Link className="btn" to="/doctor/availability">{t.availableSlots}</Link>
        </div>
        <div className="grid grid-3">
          <div className="card stat-card">
            <h3>{t.consultations}</h3>
            <div className="value">{list.length}</div>
          </div>
          <div className="card stat-card">
            <h3>Pending / upcoming</h3>
            <div className="value">{pending}</div>
          </div>
          <div className="card stat-card">
            <h3>Actions</h3>
            <Link to="/doctor/consultations" className="btn" style={{ marginTop: 8 }}>Manage</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
