import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Chatbot from '../../components/Chatbot';
import { useLanguage } from '../../context/LanguageContext';
import { farmsApi, predictionsApi } from '../../services/api';

export default function Result() {
  const { predictionId } = useParams();
  const { t } = useLanguage();
  const [prediction, setPrediction] = useState(null);
  const [farm, setFarm] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { prediction: p } = await predictionsApi.get(predictionId);
        setPrediction(p);
        const { farm: f } = await farmsApi.get(p.farmId);
        setFarm(f);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [predictionId]);

  if (error) return <div className="container page"><div className="alert alert-error">{error}</div></div>;
  if (!prediction) return <div className="container page"><p className="muted">{t.loading}</p></div>;

  const rec = prediction.recommendation || {};
  const imageSrc = prediction.imageUrl?.startsWith('data:') ? null : prediction.imageUrl;
  const gradCamSrc = prediction.gradCam?.imageUrl?.startsWith('data:') ? null : prediction.gradCam?.imageUrl;

  return (
    <div className="page">
      <div className="container">
        <div className="result-hero">
          <p style={{ margin: 0 }}>🌱 {t.brand}</p>
          <h1>{t.disease}: {prediction.disease}</h1>
          <p className="muted">
            {t.farmName}: {farm?.farmName || '—'} · {t.location}: {farm?.locationLabel || '—'} · {t.area}: {farm?.area} {farm?.areaUnit}
          </p>

          <div className="metric-row">
            <div className="metric">
              <label>{t.confidence}</label>
              <strong>{prediction.confidence}%</strong>
            </div>
            <div className="metric">
              <label>{t.leafSeverity}</label>
              <strong>{prediction.leafSeverity}% — {prediction.severityLevel}</strong>
            </div>
            <div className="metric">
              <label>{t.estimatedSpread}</label>
              <strong>
                {prediction.estimatedFarmSpread?.estimatedSpreadPercent != null
                  ? `~${prediction.estimatedFarmSpread.estimatedSpreadPercent}%`
                  : '—'}
              </strong>
            </div>
            <div className="metric">
              <label>{t.spreadRisk}</label>
              <strong>
                <span className={`badge risk-${prediction.spreadRisk?.risk}`}>{prediction.spreadRisk?.risk}</span>
              </strong>
            </div>
          </div>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 12 }}>{t.samplesNote}</p>
        </div>

        <div className="section-title"><h2>{t.gradCamTitle}</h2></div>
        <div className="card">
          <p className="muted">{t.gradCamExplain}</p>
          <div className="image-compare">
            <div>
              <h4>{t.originalImage}</h4>
              <div className="image-frame">
                {imageSrc ? (
                  <img src={imageSrc} alt="Original leaf" />
                ) : (
                  <div className="empty" style={{ color: '#ddd' }}>Leaf image stored (preview limited in mock storage)</div>
                )}
              </div>
            </div>
            <div>
              <h4>{t.heatmap}</h4>
              <div className="image-frame">
                {gradCamSrc ? (
                  <img src={gradCamSrc} alt="Grad-CAM XAI heatmap" />
                ) : (
                  <div className="empty" style={{ color: '#ddd' }}>Grad-CAM image unavailable</div>
                )}
              </div>
            </div>
          </div>
          {prediction.gradCam?.available && (
            <p className="muted" style={{ marginTop: 8 }}>Grad-CAM highlights regions that contributed most to the predicted severity class; it does not prove causal reasoning.</p>
          )}
          {prediction.affectedRegion && (
            <p className="muted" style={{ marginTop: 8 }}>
              Affected region (YOLOv8): x={prediction.affectedRegion.x?.toFixed?.(2)}, y={prediction.affectedRegion.y?.toFixed?.(2)},
              w={prediction.affectedRegion.width?.toFixed?.(2)}, h={prediction.affectedRegion.height?.toFixed?.(2)}
            </p>
          )}
        </div>

        <div className="section-title"><h2>🤖 {t.recommendedActions}</h2></div>
        <div className="card grid grid-2">
          <div>
            <h4>{t.immediateActions}</h4>
            <ul>{(rec.immediateActions || []).map((a, i) => <li key={i}>{a}</li>)}</ul>
            <h4>{t.fieldMonitoring}</h4>
            <ul>{(rec.fieldMonitoring || []).map((a, i) => <li key={i}>{a}</li>)}</ul>
          </div>
          <div>
            <h4>{t.preventive}</h4>
            <ul>{(rec.preventivePractices || []).map((a, i) => <li key={i}>{a}</li>)}</ul>
            <h4>{t.followUp}</h4>
            <ul>{(rec.followUp || []).map((a, i) => <li key={i}>{a}</li>)}</ul>
            <h4>{t.whenConsult}</h4>
            <p>{rec.consultDoctorWhen}</p>
          </div>
        </div>

        <div className="section-title"><h2>🌿 {t.matchingProducts}</h2></div>
        <div className="grid grid-2">
          {(prediction.matchingProducts || []).length === 0 ? (
            <div className="card muted">No verified catalogue products matched this disease yet. Products come from Firestore — never invented by Gemini.</div>
          ) : (
            prediction.matchingProducts.map((p) => (
              <div className="card product-card" key={p.productId}>
                {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <div style={{ width: 72, height: 72, background: 'var(--cotton)', borderRadius: 12 }} />}
                <div>
                  <h3 style={{ margin: 0 }}>{p.productName}</h3>
                  <p className="muted" style={{ margin: '4px 0' }}>{p.manufacturer} · {p.activeIngredient}</p>
                  <strong>₹{p.price}</strong> · Stock: {p.stock}
                  <p style={{ fontSize: '0.85rem' }}>{p.usageInformation}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="section-title"><h2>👨‍⚕️ {t.needExpert}</h2></div>
        <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link className="btn" to="/doctors">{t.consultDoctor}</Link>
          <Link className="btn btn-secondary" to={`/farms/${prediction.farmId}`}>{t.history}</Link>
          <Link className="btn btn-secondary" to={`/detect?farmId=${prediction.farmId}`}>{t.followUp}</Link>
        </div>

        <div className="section-title"><h2>💬 {t.askAi}</h2></div>
        <Chatbot
          embedded
          farmId={prediction.farmId}
          context={{
            latestDisease: prediction.disease,
            leafSeverity: prediction.leafSeverity,
            farmName: farm?.farmName,
          }}
        />
      </div>
      <Chatbot farmId={prediction.farmId} />
    </div>
  );
}
