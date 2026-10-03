import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FarmMap from '../../components/FarmMap';
import { useLanguage } from '../../context/LanguageContext';
import { farmsApi } from '../../services/api';

export default function FarmForm() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    farmName: '',
    locationLabel: '',
    crop: 'Cotton',
    area: 0,
    areaUnit: 'acres',
    latitude: null,
    longitude: null,
    boundary: [],
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { farm } = await farmsApi.create(form);
      navigate(`/farms/${farm.farmId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.addFarm}</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit} className="grid grid-2">
          <div className="card">
            <div className="form-group">
              <label>{t.farmName}</label>
              <input required value={form.farmName} onChange={(e) => setForm({ ...form, farmName: e.target.value })} placeholder="Farm 1" />
            </div>
            <div className="form-group">
              <label>{t.location}</label>
              <input value={form.locationLabel} onChange={(e) => setForm({ ...form, locationLabel: e.target.value })} placeholder="Pune / Baramati / Daund" />
            </div>
            <div className="form-group">
              <label>{t.crop}</label>
              <input value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t.area} ({t.acres})</label>
              <input
                type="number"
                step="0.01"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: Number(e.target.value) })}
              />
              <span className="muted">Auto-calculated when you draw a boundary; you can override.</span>
            </div>
            <button className="btn" disabled={saving}>{saving ? t.loading : t.saveFarm}</button>
          </div>
          <div className="card">
            <h3>{t.drawBoundary}</h3>
            <p className="muted">{t.selectLocation}</p>
            <FarmMap
              value={form}
              onChange={(geo) =>
                setForm((f) => ({
                  ...f,
                  ...geo,
                  locationLabel: f.locationLabel || geo.locationLabel || '',
                  area: geo.area != null ? geo.area : f.area,
                }))
              }
            />
          </div>
        </form>
      </div>
    </div>
  );
}
