/**
 * AI Model Service Interface
 *
 * Clean adapter for:
 *  - YOLOv8 disease detection
 *  - EfficientNetV2-B0 severity prediction
 *  - Grad-CAM explainability
 *
 * Modes:
 *  - mock   : deterministic simulated pipeline for development
 *  - python : calls external Python inference service
 */

const { env } = require('../config/env');
const { severityLevel } = require('../utils/severity');

const DISEASE_CLASSES = [
  'Bacterial Blight',
  'Curl Virus',
  'Fusarium Wilt',
  'Healthy',
];

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

/**
 * Remove a data URL prefix from a base64 image.
 *
 * Example:
 * data:image/jpeg;base64,ABCDEF...
 *
 * becomes:
 * ABCDEF...
 */
function cleanBase64Image(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return null;
  }

  return dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

/**
 * Convert a base64 image/data URL into a Node.js Buffer.
 */
function base64ToBuffer(dataUrl) {
  const cleaned = cleanBase64Image(dataUrl);

  if (!cleaned) {
    return null;
  }

  try {
    const buffer = Buffer.from(cleaned, 'base64');

    if (!buffer.length) {
      return null;
    }

    return buffer;
  } catch (err) {
    console.warn('[AI] Failed to decode base64 image:', err.message);
    return null;
  }
}

/**
 * MOCK PIPELINE
 *
 * Used only when:
 * AI_MODEL_MODE=mock
 *
 * This does NOT create a real YOLO annotated image.
 */
function mockPipeline(imageBuffer, meta = {}) {
  const h = hashBuffer(imageBuffer);

  const classIdx = h % DISEASE_CLASSES.length;
  const disease = DISEASE_CLASSES[classIdx];
  const isHealthy = disease === 'Healthy';

  const confidence = isHealthy
    ? 85 + (h % 12)
    : 70 + (h % 28);

  // Leaf severity:
  // how severely THIS leaf is affected
  const leafSeverity = isHealthy
    ? Math.min(8, h % 10)
    : 25 + (h % 55);

  const level = severityLevel(leafSeverity);

  /**
   * Simulated YOLO bounding box.
   *
   * Coordinates are normalized between 0 and 1.
   */
  const affectedRegion = isHealthy
    ? null
    : {
        x: 0.15 + (h % 20) / 100,
        y: 0.1 + (h % 15) / 100,
        width: 0.4 + (h % 25) / 100,
        height: 0.35 + (h % 20) / 100,
        label: 'affected_region',
        detector: 'YOLOv8 (mock)',
      };

  /**
   * Mock Grad-CAM information.
   *
   * Real Grad-CAM image is provided by Python mode.
   */
  const gradCam = {
    available: true,
    mode: 'mock',

    explanation:
      'Highlighted regions show the areas that contributed most to the model\'s prediction. Grad-CAM is an explanation/visualization of model attention — it does not prove the model\'s reasoning.',

    heatmapHint: {
      centerX: affectedRegion
        ? affectedRegion.x + affectedRegion.width / 2
        : 0.5,

      centerY: affectedRegion
        ? affectedRegion.y + affectedRegion.height / 2
        : 0.5,

      intensity: isHealthy
        ? 0.2
        : 0.4 + leafSeverity / 200,
    },

    disclaimer:
      'Grad-CAM visualizes model attention. It does not prove causal reasoning.',
  };

  return {
    pipeline: [
      'YOLOv8',
      'EfficientNetB0',
      'Severity',
      'Grad-CAM',
    ],

    mode: 'mock',

    disease,

    confidence: Number(confidence.toFixed(1)),

    leafSeverity: Number(leafSeverity.toFixed(1)),

    severityLevel: level,

    affectedRegion,

    detections: affectedRegion
      ? [
          {
            disease,
            confidence: Number(confidence.toFixed(1)),
            bbox: [
              affectedRegion.x,
              affectedRegion.y,
              affectedRegion.width,
              affectedRegion.height,
            ],
          },
        ]
      : [],

    gradCam,

    /**
     * Mock mode has no actual annotated image.
     *
     * Python mode will provide:
     * annotatedImageBuffer
     */
    annotatedImageBuffer: null,

    /**
     * Mock mode also has no actual Grad-CAM image.
     */
    gradCamImageBuffer: null,

    classes: DISEASE_CLASSES,

    modelInfo: {
      detector: 'YOLOv8 (adapter — mock)',
      classifier: 'EfficientNetB0 (adapter — mock)',

      note:
        'Replace AI_MODEL_MODE=python and point AI_MODEL_SERVICE_URL to a real inference service.',
    },

    meta,
  };
}

/**
 * Call external Python inference microservice.
 *
 * FastAPI endpoint:
 * POST /predict
 *
 * Expected multipart field:
 * file
 *
 * Python returns:
 *  - disease
 *  - confidence
 *  - leafSeverity
 *  - severityLevel
 *  - detections
 *  - affectedRegion
 *  - annotated_image
 *  - gradCamImageBase64
 *  - gradCam
 */
async function pythonPipeline(imageBuffer, meta = {}) {
  const url = `${env.aiModelServiceUrl}/predict`;

  try {
    const boundary = '----CottonGuard' + Date.now();

    /**
     * FastAPI expects:
     *
     * file: UploadFile = File(...)
     */
    const header =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="leaf.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`;

    const footer =
      `\r\n--${boundary}--\r\n`;

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

    /**
     * If Python service returns an error,
     * keep existing fallback behavior.
     */
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

    /**
     * ============================================================
     * GRAD-CAM IMAGE
     * ============================================================
     *
     * Python returns:
     *
     * gradCamImageBase64:
     * "....base64...."
     *
     * Convert it to a Buffer so prediction.service.js
     * can upload it to Cloudinary.
     */
    let gradCamImageBuffer = null;

    if (data.gradCamImageBase64) {
      gradCamImageBuffer = base64ToBuffer(
        data.gradCamImageBase64
      );

      if (gradCamImageBuffer) {
        console.log(
          `[AI] Grad-CAM image decoded: ${gradCamImageBuffer.length} bytes`
        );
      }
    }

    /**
     * ============================================================
     * YOLO ANNOTATED IMAGE
     * ============================================================
     *
     * Python app.py already creates:
     *
     * annotated_image =
     * "data:image/jpeg;base64,..."
     *
     * This image contains the actual YOLO bounding boxes,
     * disease labels and confidence values.
     *
     * Convert it to a Buffer so prediction.service.js
     * can upload it to Cloudinary.
     */
    let annotatedImageBuffer = null;

    if (data.annotated_image) {
      annotatedImageBuffer = base64ToBuffer(
        data.annotated_image
      );

      if (annotatedImageBuffer) {
        console.log(
          `[AI] YOLO annotated image decoded: ${annotatedImageBuffer.length} bytes`
        );
      }
    }

    /**
     * Return the complete Python result.
     *
     * prediction.service.js will later upload:
     *
     * annotatedImageBuffer -> Cloudinary
     * gradCamImageBuffer   -> Cloudinary
     */
    return {
      ...data,

      /**
       * Actual YOLO bounding-box image.
       */
      annotatedImageBuffer,

      /**
       * Actual Grad-CAM image.
       */
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
    /**
     * Python service unreachable.
     *
     * Keep the existing mock fallback.
     */
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

/**
 * Main disease prediction pipeline.
 */
async function runDiseasePipeline(imageBuffer, meta = {}) {
  if (!imageBuffer || !imageBuffer.length) {
    throw Object.assign(
      new Error('Image buffer required'),
      { status: 400 }
    );
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