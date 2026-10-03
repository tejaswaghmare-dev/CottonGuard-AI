import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { farmsApi } from '../../services/api';

export default function FarmsList() {
  const { t } = useLanguage();
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    farmsApi.list()
      .then((d) => setFarms(d.farms || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <h1>{t.myFarms}</h1>
          <Link className="btn" to="/farms/new">{t.addFarm}</Link>
        </div>
        {loading && <p className="muted">{t.loading}</p>}
        {!loading && farms.length === 0 && (
          <div className="card empty"><p>{t.emptyFarms}</p></div>
        )}
        <div className="grid grid-2">
          {farms.map((f) => (
            <div className="card" key={f.farmId}>
              <h3>{f.farmName}</h3>
              <p className="muted">{f.locationLabel} · {f.area} {f.areaUnit} · {f.crop}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link className="btn" to={`/farms/${f.farmId}`}>{t.history}</Link>
                <Link className="btn btn-secondary" to={`/detect?farmId=${f.farmId}`}>{t.detectDisease}</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
