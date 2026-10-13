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
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [f, p] = await Promise.all([
          farmsApi.get(farmId),
          farmsApi.predictions(farmId),
        ]);

        setFarm(f.farm);
        setPredictions(p.predictions || []);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [farmId]);

  if (error) {
    return (
      <div className="container page">
        <div className="alert alert-error">
          {error}
        </div>
      </div>
    );
  }

  if (!farm) {
    return (
      <div className="container page">
        <p className="muted">{t.loading}</p>
      </div>
    );
  }

  const latest = predictions[0] || null;

  return (
    <div className="page">
      <div className="container">

        <div className="section-title">
          <div>
            <h1>{farm.farmName}</h1>

            <p className="muted">
              {farm.locationLabel || '—'} · {farm.area}{' '}
              {farm.areaUnit} · {farm.crop}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <Link
              className="btn"
              to={`/detect?farmId=${farmId}`}
            >
              {t.uploadLeaf}
            </Link>

            <Link
              className="btn btn-secondary"
              to={`/detect?farmId=${farmId}`}
            >
              {t.followUp}
            </Link>
          </div>
        </div>

        {/* Farm statistics */}
        <div
          className="grid grid-3"
          style={{ marginBottom: '1rem' }}
        >
          <div className="card stat-card">
            <h3>{t.latestDisease}</h3>

            <div
              className="value"
              style={{ fontSize: '1.2rem' }}
            >
              {latest?.disease || '—'}
            </div>
          </div>

          <div className="card stat-card">
            <h3>{t.latestSeverity}</h3>

            <div className="value">
              {latest
                ? `${latest.leafSeverity ?? 0}%`
                : '—'}
            </div>
          </div>

          <div className="card stat-card">
            <h3>{t.history}</h3>

            <div className="value">
              {predictions.length}
            </div>
          </div>
        </div>

        {/* Farm information */}
        <div
          className="card"
          style={{ marginBottom: '1rem' }}
        >
          <h3>Farm Information</h3>

          <div className="grid grid-2">
            <div>
              <strong>Farm Name</strong>
              <p className="muted">
                {farm.farmName || '—'}
              </p>
            </div>

            <div>
              <strong>Crop</strong>
              <p className="muted">
                {farm.crop || 'Cotton'}
              </p>
            </div>

            <div>
              <strong>Area</strong>
              <p className="muted">
                {farm.area ?? '—'} {farm.areaUnit || ''}
              </p>
            </div>

            <div>
              <strong>Location</strong>
              <p className="muted">
                {farm.locationLabel || '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Disease history */}
        <div
          className="card"
          style={{ marginBottom: '1rem' }}
        >
          <h3>{t.history}</h3>

          <HistoryChart
            predictions={predictions}
          />
        </div>

        {/* Predictions */}
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
                  <td>
                    {(p.createdAt || '').slice(0, 10)}
                  </td>

                  <td>
                    {p.disease || '—'}
                  </td>

                  <td>
                    {p.leafSeverity ?? 0}% —{' '}
                    {p.severityLevel || 'Unknown'}
                  </td>

                  <td>
                    {p.confidence ?? 0}%
                  </td>

                  <td>
                    <Link
                      to={`/results/${p.predictionId}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {predictions.length === 0 && (
            <p className="empty">
              {t.uploadLeaf}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}