import { useEffect, useState } from 'react';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import {
  farmsApi,
  predictionsApi,
} from '../../services/api';

export default function Detect() {
  const { t } = useLanguage();

  const [params] = useSearchParams();
  const navigate = useNavigate();

  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(
    params.get('farmId') || ''
  );

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    farmsApi
      .list()
      .then((d) => {
        if (!mounted) return;

        setFarms(d.farms || []);

        if (!farmId && d.farms?.[0]) {
          setFarmId(d.farms[0].farmId);
        }
      })
      .catch((err) => {
        console.error('[Detect] Failed to load farms:', err);
        setError(
          err?.message || 'Failed to load farms'
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  function onFile(e) {
    const f = e.target.files?.[0];

    if (!f) return;

    if (
      ![
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/jpg',
      ].includes(f.type)
    ) {
      setError(
        'Only JPEG, PNG, or WebP images allowed'
      );
      return;
    }

    setError('');
    setFile(f);

    const objectUrl = URL.createObjectURL(f);
    setPreview(objectUrl);
  }

  async function onSubmit(e) {
    e.preventDefault();

    if (!farmId) {
      setError('Select a farm');
      return;
    }

    if (!file) {
      setError('Upload a leaf image');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response =
        await predictionsApi.create(
          farmId,
          file,
          notes
        );

      console.log(
        '[Detect] Prediction response:',
        response
      );

      const prediction =
        response?.prediction;

      if (!prediction) {
        throw new Error(
          'Prediction was created, but no prediction data was returned.'
        );
      }

      const predictionId =
        prediction.predictionId ||
        prediction.id;

      if (!predictionId) {
        throw new Error(
          'Prediction was created, but predictionId is missing.'
        );
      }

      /*
       * Pass the complete prediction through
       * React Router state AND keep the ID
       * in the URL.
       */
      navigate(
        `/results/${predictionId}`,
        {
          state: {
            prediction,
            predictionId,
          },
        }
      );
    } catch (err) {
      console.error(
        '[Detect] Prediction failed:',
        err
      );

      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Prediction failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.detectDisease}</h1>

        <p className="muted">
          YOLOv8 → EfficientNetV2-B0 → Severity →
          Grad-CAM → Gemini
        </p>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="grid grid-2"
        >
          <div className="card">
            <div className="form-group">
              <label>Select farm</label>

              <select
                required
                value={farmId}
                onChange={(e) =>
                  setFarmId(e.target.value)
                }
              >
                <option value="">—</option>

                {farms.map((f) => (
                  <option
                    key={f.farmId}
                    value={f.farmId}
                  >
                    {f.farmName} (
                    {f.locationLabel ||
                      `${f.area} ${f.areaUnit}`}
                    )
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t.uploadLeaf}</label>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFile}
              />
            </div>

            <div className="form-group">
              <label>{t.notes}</label>

              <textarea
                rows={3}
                value={notes}
                onChange={(e) =>
                  setNotes(e.target.value)
                }
                placeholder="Sample from north corner…"
              />
            </div>

            <button
              type="submit"
              className="btn btn-lg"
              disabled={loading}
            >
              {loading
                ? t.analyzing
                : t.detectDisease}
            </button>
          </div>

          <div className="card">
            <h3>Preview</h3>

            {preview ? (
              <img
                src={preview}
                alt="Leaf preview"
                style={{
                  width: '100%',
                  borderRadius: 12,
                  maxHeight: 360,
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div className="empty">
                Choose a clear cotton leaf photo
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}