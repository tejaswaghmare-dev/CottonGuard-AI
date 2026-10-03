import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { farmsApi } from '../../services/api';
import Chatbot from '../../components/Chatbot';

export default function FarmerDashboard() {
  const { profile, quota, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [farms, setFarms] = useState([]);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await refreshProfile();
        const { farms: list } = await farmsApi.list();
        setFarms(list || []);
        if (list?.[0]) {
          const { predictions } = await farmsApi.predictions(list[0].farmId);
          setLatest(predictions?.[0] || null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const remaining = quota?.remaining ?? '—';
  const rec = latest?.recommendation?.immediateActions?.[0];

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <div>
            <h1>{t.dashboard}</h1>
            <p className="muted">Namaste, {profile?.displayName || 'Farmer'}</p>
          </div>
          <Link className="btn btn-lg" to="/farms/new">{t.addFarm}</Link>
        </div>

        {loading ? (
          <p className="muted">{t.loading}</p>
        ) : (
          <>
            <div className="grid grid-4">
              <div className="card stat-card">
                <h3>{t.totalFarms}</h3>
                <div className="value">{farms.length}</div>
              </div>
              <div className="card stat-card">
                <h3>{t.latestDisease}</h3>
                <div className="value" style={{ fontSize: '1.2rem' }}>{latest?.disease || '—'}</div>
              </div>
              <div className="card stat-card">
                <h3>{t.latestSeverity}</h3>
                <div className="value">{latest ? `${latest.leafSeverity}%` : '—'}</div>
              </div>
              <div className="card stat-card">
                <h3>{t.estimatedFarmSpread}</h3>
                <div className="value">
                  {latest?.estimatedFarmSpread?.estimatedSpreadPercent != null
                    ? `~${latest.estimatedFarmSpread.estimatedSpreadPercent}%`
                    : '—'}
                </div>
              </div>
              <div className="card stat-card">
                <h3>{t.diseaseRisk}</h3>
                <div className="value">
                  {latest?.spreadRisk?.risk ? (
                    <span className={`badge risk-${latest.spreadRisk.risk}`}>{latest.spreadRisk.risk}</span>
                  ) : '—'}
                </div>
              </div>
              <div className="card stat-card">
                <h3>{t.freeCallsRemaining}</h3>
                <div className="value">{remaining}/5</div>
              </div>
              <div className="card stat-card">
                <h3>{t.doctorConsultation}</h3>
                <Link to="/doctors" className="btn" style={{ marginTop: 8 }}>{t.consultDoctor}</Link>
              </div>
              <div className="card stat-card">
                <h3>{t.aiAssistant}</h3>
                <p className="muted" style={{ margin: 0 }}>Use the chat button or Detect page</p>
              </div>
            </div>

            <div className="section-title">
              <h2>{t.myFarms}</h2>
            </div>
            {farms.length === 0 ? (
              <div className="card empty">
                <p>{t.emptyFarms}</p>
                <Link className="btn" to="/farms/new">{t.addFarm}</Link>
              </div>
            ) : (
              <div className="grid grid-3">
                {farms.map((f) => (
                  <Link key={f.farmId} to={`/farms/${f.farmId}`} className="card" style={{ color: 'inherit' }}>
                    <h3>{f.farmName}</h3>
                    <p className="muted" style={{ margin: 0 }}>
                      {f.locationLabel || '—'} · {f.area} {f.areaUnit} · {f.crop}
                    </p>
                  </Link>
                ))}
              </div>
            )}

            {rec && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <h3>{t.latestRecommendation}</h3>
                <p>{rec}</p>
              </div>
            )}
          </>
        )}
      </div>
      <Chatbot />
    </div>
  );
}
