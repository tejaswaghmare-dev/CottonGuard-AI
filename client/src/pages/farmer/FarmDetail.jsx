import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import HistoryChart from '../../components/HistoryChart';
import { useLanguage } from '../../context/LanguageContext';
import { farmsApi } from '../../services/api';

export default function FarmDetail() {
  const { farmId } = useParams();
  const { t } = useLanguage();
  const [farm, setFarm] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [spread, setSpread] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [f, p, s] = await Promise.all([
          farmsApi.get(farmId),
          farmsApi.predictions(farmId),
          farmsApi.spread(farmId),
        ]);
        setFarm(f.farm);
        setPredictions(p.predictions || []);
        setSpread(s);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [farmId]);

  if (error) return <div className="container page"><div className="alert alert-error">{error}</div></div>;
  if (!farm) return <div className="container page"><p className="muted">{t.loading}</p></div>;

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <div>
            <h1>{farm.farmName}</h1>
            <p className="muted">
              {farm.locationLabel} · {farm.area} {farm.areaUnit} · {farm.crop}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="btn" to={`/detect?farmId=${farmId}`}>{t.uploadLeaf}</Link>
            <Link className="btn btn-secondary" to={`/detect?farmId=${farmId}`}>{t.followUp}</Link>
          </div>
        </div>

        <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
          <div className="card stat-card">
            <h3>{t.estimatedSpread}</h3>
            <div className="value">
              {spread?.spread?.estimatedSpreadPercent != null
                ? `~${spread.spread.estimatedSpreadPercent}%`
                : '—'}
            </div>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Samples: {spread?.spread?.samplesAnalyzed || 0} · Diseased: {spread?.spread?.diseasedSamples || 0}
            </p>
          </div>
          <div className="card stat-card">
            <h3>{t.spreadRisk}</h3>
            <div className="value">
              {spread?.risk?.risk ? (
                <span className={`badge risk-${spread.risk.risk}`}>{spread.risk.risk}</span>
              ) : '—'}
            </div>
          </div>
          <div className="card stat-card">
            <h3>{t.history}</h3>
            <div className="value">{predictions.length}</div>
          </div>
        </div>

        <div className="alert alert-info">{t.samplesNote}</div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>{t.history}</h3>
          <HistoryChart predictions={predictions} />
        </div>

        <div className="card">
          <h3>Predictions</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>{t.disease}</th>
                <th>{t.leafSeverity}</th>
                <th>{t.confidence}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {predictions.map((p) => (
                <tr key={p.predictionId}>
                  <td>{(p.createdAt || '').slice(0, 10)}</td>
                  <td>{p.disease}</td>
                  <td>{p.leafSeverity}% — {p.severityLevel}</td>
                  <td>{p.confidence}%</td>
                  <td><Link to={`/results/${p.predictionId}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {predictions.length === 0 && <p className="empty">{t.uploadLeaf}</p>}
        </div>
      </div>
    </div>
  );
}
