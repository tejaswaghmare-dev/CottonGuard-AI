
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import Chatbot from '../../components/Chatbot';
import { predictionsApi } from '../../services/api';

const DEFAULT_PIPELINE = [
  'YOLOv8n',
  'EfficientNetV2-B0',
  'Severity',
  'Grad-CAM',
  'Gemini',
];

function unwrapPrediction(response) {
  // Support common Axios and Express response formats.
  let data = response?.data ?? response;

  if (data?.prediction) data = data.prediction;
  else if (data?.data?.prediction) data = data.data.prediction;
  else if (data?.data && typeof data.data === 'object') {
    data = data.data;
  }

  return data && typeof data === 'object' && !Array.isArray(data)
    ? data
    : null;
}

function safeText(value, fallback = '') {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return fallback;
}

function toPercent(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 0;

  return Math.min(100, Math.max(0, number <= 1 ? number * 100 : number));
}

function formatDiseaseName(value) {
  return safeText(value, 'Unknown')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSeverity(value) {
  return safeText(value, 'Unknown')
    .replace(/[_-]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}


function getImage(value) {
  if (typeof value !== 'string') return '';

  const image = value.trim();
  if (!image) return '';

  // Already a data URI or a valid image URL.
  if (
    /^data:image\//i.test(image) ||
    /^https?:\/\//i.test(image) ||
    image.startsWith('/') ||
    image.startsWith('blob:')
  ) {
    return image;
  }

  // Handle raw base64 returned by the Python AI service.
  if (
    image.length > 100 &&
    /^[A-Za-z0-9+/=\r\n]+$/.test(image)
  ) {
    const base64 = image.replace(/\s/g, '');

    if (base64.startsWith('iVBOR')) {
      return `data:image/png;base64,${base64}`;
    }

    if (base64.startsWith('/9j/')) {
      return `data:image/jpeg;base64,${base64}`;
    }

    if (base64.startsWith('R0lGOD')) {
      return `data:image/gif;base64,${base64}`;
    }

    if (base64.startsWith('UklGR')) {
      return `data:image/webp;base64,${base64}`;
    }

    // Fallback for other base64 image formats.
    return `data:image/png;base64,${base64}`;
  }

  return image;
}


function getRecommendation(prediction) {
  const value =
    prediction?.recommendation ??
    prediction?.geminiRecommendation ??
    prediction?.advice ??
    '';

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).join('\n');
  }

  if (value && typeof value === 'object') {
    // Support the structured response returned by Gemini.
    const sections = [
      ['Immediate Actions', value.immediateActions],
      ['Field Monitoring', value.fieldMonitoring],
      ['Preventive Practices', value.preventivePractices],
      ['Follow-up Plan', value.followUp],
      ['When to Consult a Doctor', value.consultDoctorWhen],
    ];

    const hasStructuredAdvice = sections.some(
      ([, content]) =>
        Array.isArray(content) ||
        (typeof content === 'string' && content.trim())
    );

    if (hasStructuredAdvice) {
      return sections
        .filter(([, content]) =>
          Array.isArray(content)
            ? content.length > 0
            : typeof content === 'string' && content.trim()
        )
        .map(([title, content]) => {
          const text = Array.isArray(content)
            ? content.map((item) => `• ${safeText(item)}`).join('\n')
            : safeText(content);

          return `${title}\n${text}`;
        })
        .join('\n\n');
    }

    const text =
      value.text ??
      value.recommendation ??
      value.message ??
      value.content;

    if (typeof text === 'string') return text;
    if (Array.isArray(text)) {
      return text.map((item) => safeText(item)).join('\n');
    }
  }

  return '';
}

export default function Result() {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const initialPrediction = useMemo(
    () => unwrapPrediction(location.state?.prediction),
    [location.state]
  );

  const [prediction, setPrediction] = useState(initialPrediction);
  const [loading, setLoading] = useState(!initialPrediction);
  const [error, setError] = useState('');

  const predictionId = useMemo(() => {
    const stateId = location.state?.predictionId;

    if (stateId) return String(stateId);

    if (prediction?.predictionId) return String(prediction.predictionId);
    if (prediction?.id) return String(prediction.id);
    if (prediction?._id) return String(prediction._id);

    const parts = location.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }, [location.pathname, location.state, prediction]);

  useEffect(() => {
    let cancelled = false;

    async function loadPrediction() {
      // Only skip the API call when we have actual prediction data.
      if (initialPrediction) {
        setPrediction(initialPrediction);
        setLoading(false);
        setError('');
        return;
      }

      if (!predictionId || predictionId === 'results') {
        setLoading(false);
        setError('Prediction ID is missing from the URL.');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await predictionsApi.get(predictionId);
        const data = unwrapPrediction(response);

        if (!data || !Object.keys(data).length) {
          throw new Error(
            'The server returned no prediction data. Check the prediction API response.'
          );
        }

        if (!cancelled) setPrediction(data);
      } catch (err) {
        console.error('[Result] Failed to load prediction:', err);

        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              err?.message ||
              'Failed to load prediction.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPrediction();

    return () => {
      cancelled = true;
    };
  }, [predictionId, initialPrediction]);

  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <div className="card" style={{ marginTop: 40 }}>
            <h2>Loading prediction...</h2>
            <p className="muted">Please wait while we load your AI analysis.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !prediction) {
    return (
      <div className="page">
        <div className="container">
          <div className="card" style={{ marginTop: 40 }}>
            <h2>Prediction not available</h2>
            <p className="muted">
              {error || 'We could not find the requested prediction.'}
            </p>
            <button className="btn" onClick={() => navigate('/detect')}>
              ← Back to Detection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const disease =
    prediction.disease ??
    prediction.predictedDisease ??
    prediction.className ??
    prediction.predicted_class ??
    'Unknown';

  const confidence = toPercent(
    prediction.confidence ??
      prediction.diseaseConfidence ??
      prediction.disease_confidence
  );

  const severity =
    prediction.severityLevel ??
    prediction.severity ??
    prediction.leafSeverity ??
    prediction.severity_class ??
    'Unknown';

  const severityConfidence = toPercent(
    prediction.severity_confidence ?? prediction.severityConfidence
  );

  const affectedArea = Math.min(
    100,
    Math.max(
      0,
      Number(
        prediction.affectedAreaPercent ??
          prediction.affected_area_percent ??
          prediction.affectedArea ??
          0
      ) || 0
    )
  );

  const originalImage = getImage(
    prediction.imageUrl ??
      prediction.originalImageUrl ??
      prediction.leafImageUrl ??
      prediction.image ??
      prediction.original_image ??
      prediction.imageBase64
  );

  const yoloData = prediction.yoloDetection ?? {};

  const yoloImage = getImage(
    yoloData.imageUrl ??
      yoloData.annotatedImageUrl ??
      yoloData.image ??
      yoloData.imageBase64 ??
      prediction.yoloDetectionImageUrl ??
      prediction.annotatedImageUrl ??
      prediction.annotated_image_url ??
      prediction.annotatedImageBase64 ??
      prediction.yoloImageBase64
  );

  const gradCamData =
  prediction.gradCam ??
  prediction.grad_cam ??
  {};

  const gradCamImage = getImage(
  gradCamData.imageUrl ??
    gradCamData.gradCamImageUrl ??
    gradCamData.url ??
    gradCamData.image ??
    gradCamData.imageBase64 ??
    prediction.gradCamImageUrl ??
    prediction.gradCamUrl ??
    prediction.gradCamImage ??
    prediction.gradCamImageBase64 ??
    prediction.gradCamBase64 ??
    prediction.grad_cam_image ??
    prediction.grad_cam_image_base64 ??
    prediction.gradcam_image ??
    prediction.gradcamImage ??
    prediction.explanationImage
);
  const recommendation = getRecommendation(prediction);

  const products = Array.isArray(prediction.matchingProducts)
  ? prediction.matchingProducts
  : Array.isArray(prediction.products)
    ? prediction.products
    : [];

  const detections = Array.isArray(prediction.detections)
    ? prediction.detections
    : Array.isArray(yoloData.detections)
      ? yoloData.detections
      : [];

  const rawPipeline = Array.isArray(prediction.pipeline)
    ? prediction.pipeline
    : DEFAULT_PIPELINE;

  const pipeline = rawPipeline.map((stage) =>
    typeof stage === 'string'
      ? stage
      : safeText(stage?.name ?? stage?.stage ?? stage?.model, 'AI stage')
  );

  const predictionFarmId =
    prediction.farmId ?? prediction.farm_id ?? undefined;

  const resolvedPredictionId =
    prediction.predictionId ?? prediction.id ?? prediction._id ?? predictionId;

  return (
    <div className="page">
      <div className="container">
        <header
          style={{
            marginBottom: 24,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ marginBottom: 6 }}>AI Disease Analysis</h1>
            <p className="muted">
              CottonGuard AI analysis using YOLOv8, EfficientNetV2-B0 and
              Grad-CAM.
            </p>
          </div>

          <span
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              background: 'rgba(154,205,50,0.10)',
              border: '1px solid rgba(154,205,50,0.25)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            🤖 AI Powered
          </span>
        </header>

        <div className="grid grid-3" style={{ marginBottom: 24 }}>
          <SummaryCard icon="🦠" title="Detected Disease" value={formatDiseaseName(disease)} />
          <SummaryCard icon="🎯" title="Disease Confidence" value={`${confidence.toFixed(1)}%`} />
          <SummaryCard icon="🌿" title="Leaf Severity" value={formatSeverity(severity)} />
          <SummaryCard icon="📊" title="Severity Confidence" value={`${severityConfidence.toFixed(1)}%`} />
          <SummaryCard icon="🍃" title="Affected Area" value={`${affectedArea.toFixed(1)}%`} />
          <SummaryCard icon="🔬" title="AI Pipeline" value={`${pipeline.length} stages`} />
        </div>

        <section className="card" style={{ marginBottom: 24, overflow: 'hidden' }}>
          <SectionHeader
            icon="🧬"
            title="Disease Detection Result"
            subtitle="YOLOv8 identifies the disease from the cotton leaf image."
          />

          <div className="result-two-columns">
            <VisualPanel
              title="Original Leaf Image"
              image={originalImage}
              emptyText="Original leaf image unavailable"
            />

            <div className="result-detail-panel">
              <div className="muted">Detected disease</div>
              <div className="result-disease-name">{formatDiseaseName(disease)}</div>
              <div className="muted">Confidence</div>
              <ProgressBar value={confidence} />
              <strong>{confidence.toFixed(1)}%</strong>
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 24 }}>
          <SectionHeader
            icon="👁️"
            title="AI Visual Explanation"
            subtitle="YOLO bounding boxes show detected regions. Grad-CAM highlights regions that influenced the severity prediction."
          />

          <div className="result-image-grid">
            <VisualPanel
              title="YOLOv8 Disease Detection"
              badge="Bounding Boxes"
              image={yoloImage}
              emptyText="YOLO annotated image unavailable"
            />
            <VisualPanel
              title="Grad-CAM Explanation"
              badge="Severity Explanation"
              image={gradCamImage}
              emptyText="Grad-CAM image unavailable"
            />
          </div>

          {detections.length > 0 && (
            <div className="result-section-divider">
              <h3>YOLO Detections</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {detections.map((item, index) => {
                  const itemConfidence = toPercent(
                    item?.confidence ?? item?.score ?? 0
                  );

                  return (
                    <div className="result-detection-row" key={item?.id ?? index}>
                      <span>
                        {formatDiseaseName(
                          item?.className ??
                            item?.class ??
                            item?.label ??
                            item?.name ??
                            'Detection'
                        )}
                      </span>
                      <strong>{itemConfidence.toFixed(1)}%</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="result-section-divider">
            <h3>AI Pipeline</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pipeline.map((stage, index) => (
                <span className="result-pipeline-chip" key={`${stage}-${index}`}>
                  {index + 1}. {stage}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 24 }}>
          <SectionHeader
            icon="🌱"
            title="Severity Analysis"
            subtitle="The severity model estimates how seriously the leaf is affected."
          />

          <div className="result-two-columns">
            <div>
              <div className="result-severity-name">{formatSeverity(severity)}</div>
              <p className="muted">Estimated affected leaf area:</p>
              <ProgressBar value={affectedArea} />
              <strong>{affectedArea.toFixed(1)}%</strong>
            </div>

            <div className="result-detail-panel">
              <div className="muted">Severity confidence</div>
              <div className="result-disease-name">
                {severityConfidence.toFixed(1)}%
              </div>
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 24 }}>
          <SectionHeader
            icon="💡"
            title="AI Recommendation"
            subtitle="Guidance generated from the detected disease and severity."
          />
          <RecommendationBox recommendation={recommendation} />
        </section>

        {products.length > 0 && (
            
        <section className="card" style={{ marginBottom: 24 }}>
          <SectionHeader
            icon="🧴"
            title="Recommended Products"
            subtitle="Existing products matched with the detected cotton disease."
          />

          {products.length === 0 ? (
            <p className="muted">
              No matching products were found for{' '}
              {formatDiseaseName(disease)}. Check the backend logs and the
              crop, target disease, and stock values in your product records.
            </p>
          ) : (
            <div className="result-product-grid">
              {products.map((product, index) => {
                const name =
                  product?.productName ??
                  product?.name ??
                  'Recommended Product';

                const image = getImage(
                  product?.imageUrl ??
                  product?.image ??
                  product?.productImageUrl
                );

                const usage =
                  product?.usageInformation ??
                  product?.usage ??
                  product?.usageInfo;

                return (
                  <div
                    className="result-product-card"
                    key={product?.productId ?? product?.id ?? index}
                  >
                    {image && (
                      <img
                        src={image}
                        alt={safeText(name)}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                        style={{
                          width: '100%',
                          height: 160,
                          objectFit: 'contain',
                          marginBottom: 12,
                          borderRadius: 10,
                        }}
                      />
                    )}

                    <h3>{safeText(name)}</h3>

                    {product?.manufacturer && (
                      <p className="muted">
                        {safeText(product.manufacturer)}
                      </p>
                    )}

                    {product?.activeIngredient && (
                      <p>
                        <strong>Active ingredient:</strong>{' '}
                        {safeText(product.activeIngredient)}
                      </p>
                    )}

                    {product?.price != null && product.price !== '' && (
                      <p>
                        <strong>Price:</strong> ₹{safeText(product.price)}
                      </p>
                    )}

                    {product?.stock != null && (
                      <p>
                        <strong>Available stock:</strong>{' '}
                        {safeText(product.stock)}
                      </p>
                    )}

                    {usage && (
                      <p>
                        <strong>Usage information:</strong>{' '}
                        {safeText(usage)}
                      </p>
                    )}

                    {product?.targetDisease && (
                      <p>
                        <strong>Target disease:</strong>{' '}
                        {safeText(
                          Array.isArray(product.targetDisease)
                            ? product.targetDisease.join(', ')
                            : product.targetDisease
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        )}

        <div className="result-actions">
          <button className="btn btn-lg" onClick={() => navigate('/detect')}>
            + Upload Another Leaf
          </button>

          <button className="btn" onClick={() => navigate('/doctors')}>
            👨‍⚕️ {t?.consultDoctor || 'Consult Leaf Doctor'}
          </button>
        </div>
      </div>

      <Chatbot
        farmId={predictionFarmId}
        context={{
          disease: safeText(disease, 'Unknown'),
          confidence,
          severity: safeText(severity, 'Unknown'),
          affectedAreaPercent: affectedArea,
          predictionId: resolvedPredictionId,
        }}
      />

      <style>{`
        .result-two-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(260px, .8fr);
          gap: 24px;
          align-items: center;
        }
        .result-image-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
          gap: 20px;
        }
        .result-detail-panel, .result-product-card {
          padding: 22px;
          border-radius: 16px;
          background: rgba(255,255,255,.025);
          border: 1px solid rgba(255,255,255,.08);
          min-width: 0;
        }
        .result-disease-name { font-size: 28px; font-weight: 800; margin: 10px 0 16px; overflow-wrap: anywhere; }
        .result-severity-name { font-size: 36px; font-weight: 800; overflow-wrap: anywhere; }
        .result-section-divider { margin-top: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.08); }
        .result-detection-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 14px; border-radius:10px; background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.06); }
        .result-pipeline-chip { padding:8px 12px; border-radius:999px; background:rgba(154,205,50,.08); border:1px solid rgba(154,205,50,.20); font-size:13px; }
        .result-product-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:16px; }
        .result-product-card h3 { margin-top:0; }
        .result-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:12px; padding:8px 0 30px; }
        @media(max-width:700px) {
          .result-two-columns { grid-template-columns:minmax(0,1fr); }
          .result-disease-name { font-size:24px; }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({ icon, title, value }) {
  return (
    <div className="card" style={{ minHeight: 130, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 25, marginBottom: 10 }}>{icon}</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 23 }}>{icon}</span>
        <h2 style={{ margin: 0 }}>{title}</h2>
      </div>
      {subtitle && <p className="muted" style={{ margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

function VisualPanel({ title, badge, image, emptyText }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [image]);

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.08)', minWidth: 0 }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <strong>{title}</strong>
        {badge && <span style={{ fontSize: 11, padding: '5px 9px', borderRadius: 999, background: 'rgba(154,205,50,.10)', whiteSpace: 'nowrap' }}>{badge}</span>}
      </div>
      <div style={{ padding: 12, minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.12)' }}>
        {image && !imageError ? (
          <img
            src={image}
            alt={title}
            onError={() => {
              console.error(`[Result] Failed to load image: ${title}`, image.slice(0, 120));
              setImageError(true);
            }}
            style={{ display: 'block', width: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 10 }}
          />
        ) : (
          <div className="empty" style={{ width: '100%', minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
            {imageError ? `${title} could not be loaded. Check the image URL or API response.` : emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ value }) {
  const safeValue = Math.min(100, Math.max(0, Number(value) || 0));

  return (
    <div style={{ height: 12, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden', margin: '12px 0' }}>
      <div style={{ width: `${safeValue}%`, height: '100%', background: 'currentColor', borderRadius: 999, transition: 'width .2s ease' }} />
    </div>
  );
}

function RecommendationBox({ recommendation }) {
  if (!recommendation) {
    return (
      <div style={{ padding: 18, borderRadius: 14, background: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.08)' }}>
        <p className="muted">No AI recommendation is available for this prediction.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, borderRadius: 16, background: 'rgba(154,205,50,.06)', border: '1px solid rgba(154,205,50,.18)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
      {recommendation}
    </div>
  );
}