/**
 * AI Model Service Interface
 *
 * Clean adapter so real YOLOv8 / EfficientNetB0 / Grad-CAM can be plugged in later
 * without rewriting the frontend.
 *
 * Modes:
 *  - mock  (default): deterministic simulated pipeline for development
 *  - python: calls external Python inference service at AI_MODEL_SERVICE_URL
 */

const { env } = require('../config/env');
const { severityLevel } = require('../utils/severity');

const DISEASE_CLASSES = ['Bacterial Blight', 'Curl Virus', 'Fusarium Wilt', 'Healthy'];

/**
 * Simple hash from buffer for deterministic mock results.
 */
function hashBuffer(buf) {
  let h = 0;
  const slice = buf.slice(0, Math.min(buf.length, 4096));
  for (let i = 0; i < slice.length; i++) {
    h = (h * 31 + slice[i]) >>> 0;
  }
  return h;
}

function mockPipeline(imageBuffer, meta = {}) {
  const h = hashBuffer(imageBuffer);
  const classIdx = h % DISEASE_CLASSES.length;
  const disease = DISEASE_CLASSES[classIdx];
  const isHealthy = disease === 'Healthy';

  const confidence = isHealthy
    ? 85 + (h % 12)
    : 70 + (h % 28);

  // Leaf severity: how severely THIS leaf is affected (not farm spread)
  const leafSeverity = isHealthy ? Math.min(8, h % 10) : 25 + (h % 55);
  const level = severityLevel(leafSeverity);

  // Simulated YOLO bounding box for affected region (normalized 0-1)
  const affectedRegion = isHealthy
    ? null
    : {
        x: 0.15 + ((h % 20) / 100),
        y: 0.1 + ((h % 15) / 100),
        width: 0.4 + ((h % 25) / 100),
        height: 0.35 + ((h % 20) / 100),
        label: 'affected_region',
        detector: 'YOLOv8 (mock)',
      };

  // Grad-CAM placeholder — real service would return heatmap image buffer
  const gradCam = {
    available: true,
    mode: 'mock',
    explanation:
      'Highlighted regions show the areas that contributed most to the model\'s prediction. Grad-CAM is an explanation/visualization of model attention — it does not prove the model\'s reasoning.',
    // Frontend can overlay a CSS heatmap; real Grad-CAM image uploaded when python mode returns buffer
    heatmapHint: {
      centerX: affectedRegion ? affectedRegion.x + affectedRegion.width / 2 : 0.5,
      centerY: affectedRegion ? affectedRegion.y + affectedRegion.height / 2 : 0.5,
      intensity: isHealthy ? 0.2 : 0.4 + leafSeverity / 200,
    },
    disclaimer:
      'Grad-CAM visualizes model attention. It does not prove causal reasoning.',
  };

  return {
    pipeline: ['YOLOv8', 'EfficientNetB0', 'Severity', 'Grad-CAM'],
    mode: 'mock',
    disease,
    confidence: Number(confidence.toFixed(1)),
    leafSeverity: Number(leafSeverity.toFixed(1)),
    severityLevel: level,
    affectedRegion,
    gradCam,
    classes: DISEASE_CLASSES,
    modelInfo: {
      detector: 'YOLOv8 (adapter — mock)',
      classifier: 'EfficientNetB0 (adapter — mock)',
      note: 'Replace AI_MODEL_MODE=python and point AI_MODEL_SERVICE_URL to a real inference service.',
    },
    meta,
  };
}

/**
 * Call external Python inference microservice.
 * Expected response shape mirrors mockPipeline.
 */
async function pythonPipeline(imageBuffer, meta = {}) {
  const url = `${env.aiModelServiceUrl}/predict`;

  try {
    const boundary = '----CottonGuard' + Date.now();

    // FastAPI expects: file: UploadFile = File(...)
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="leaf.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`;

    const footer = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(header),
      imageBuffer,
      Buffer.from(footer),
    ]);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!res.ok) {
      const errorText = await res.text();

      console.warn(
        `[AI] Python service failed: ${res.status} ${errorText}`
      );

      return mockPipeline(imageBuffer, {
        ...meta,
        fallback: true,
        pythonStatus: res.status,
      });
    }

    const data = await res.json();

    // Python returns Grad-CAM as base64.
    // Convert it to a Node Buffer so prediction.service.js
    // can upload it to Cloudinary.
    let gradCamImageBuffer = null;

    if (data.gradCamImageBase64) {
      gradCamImageBuffer = Buffer.from(
        data.gradCamImageBase64,
        'base64'
      );
    }

    return {
      ...data,
      gradCamImageBuffer,
      mode: 'python',
      pipeline:
        data.pipeline || [
          'YOLOv8n',
          'EfficientNetV2-B0',
          'Severity',
          'Grad-CAM',
        ],
    };
  } catch (err) {
    console.warn(
      '[AI] Python service unreachable, using mock:',
      err.message
    );

    return mockPipeline(imageBuffer, {
      ...meta,
      fallback: true,
      error: err.message,
    });
  }
}

async function runDiseasePipeline(imageBuffer, meta = {}) {
  if (!imageBuffer || !imageBuffer.length) {
    throw Object.assign(new Error('Image buffer required'), { status: 400 });
  }

  if (env.aiModelMode === 'python') {
    return pythonPipeline(imageBuffer, meta);
  }
  return mockPipeline(imageBuffer, meta);
}

module.exports = {
  DISEASE_CLASSES,
  runDiseasePipeline,
  mockPipeline,
};
