import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { farmsApi, predictionsApi } from '../../services/api';

export default function Detect() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(params.get('farmId') || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    farmsApi.list().then((d) => {
      setFarms(d.farms || []);
      if (!farmId && d.farms?.[0]) setFarmId(d.farms[0].farmId);
    });
  }, []);

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(f.type)) {
      setError('Only JPEG, PNG, or WebP images allowed');
      return;
    }
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!farmId) return setError('Select a farm');
    if (!file) return setError('Upload a leaf image');
    setLoading(true);
    setError('');
    try {
      const { prediction } = await predictionsApi.create(farmId, file, notes);
      navigate(`/results/${prediction.predictionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.detectDisease}</h1>
        <p className="muted">YOLOv8 → EfficientNetB0 → Severity → Grad-CAM → Farm spread estimate → Gemini</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={onSubmit} className="grid grid-2">
          <div className="card">
            <div className="form-group">
              <label>Select farm</label>
              <select required value={farmId} onChange={(e) => setFarmId(e.target.value)}>
                <option value="">—</option>
                {farms.map((f) => (
                  <option key={f.farmId} value={f.farmId}>
                    {f.farmName} ({f.locationLabel || f.area + ' ' + f.areaUnit})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{t.uploadLeaf}</label>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
            </div>
            <div className="form-group">
              <label>{t.notes}</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sample from north corner…" />
            </div>
            <button className="btn btn-lg" disabled={loading}>
              {loading ? t.analyzing : t.detectDisease}
            </button>
          </div>
          <div className="card">
            <h3>Preview</h3>
            {preview ? (
              <img src={preview} alt="Leaf preview" style={{ width: '100%', borderRadius: 12, maxHeight: 360, objectFit: 'cover' }} />
            ) : (
              <div className="empty">Choose a clear cotton leaf photo</div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
