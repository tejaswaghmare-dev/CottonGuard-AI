
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('../config/firebase');
const { assertFarmOwner } = require('./farm.service');
const { runDiseasePipeline } = require('./aiModel.service');

const {
  uploadLeafImage,
  uploadGradCamImage,
  uploadYoloDetectionImage,
} = require('./storage.service');

const { severityLevel } = require('../utils/severity');
const { generateRecommendation } = require('./gemini.service');

// Gemini gets at most 8 seconds before we use a fallback.
const GEMINI_TIMEOUT_MS = 8000;

/**
 * Safely get a numeric value without converting missing values to zero.
 */
function getNumericValue(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== '' &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}

/**
 * Safe fallback if Gemini is unavailable or takes too long.
 * This does not prescribe a specific pesticide or dosage.
 */
function createFallbackRecommendation(disease, severity) {
  return {
    status: 'temporarily_unavailable',
    summary:
      'AI-generated recommendations are temporarily unavailable. ' +
      'The disease prediction was completed successfully.',
    disease,
    severity,
    immediateActions: [
      'Inspect the affected plants and nearby cotton plants for similar symptoms.',
      'Avoid spreading potentially infected plant material between fields.',
      'Take clear photos and monitor whether symptoms spread.',
      'Consult a qualified agricultural expert before choosing a treatment.',
    ],
    precautions: [
      'Do not mix pesticides or apply an unverified dosage.',
      'If using an agricultural product, follow its label and local expert guidance.',
    ],
    message:
      'Please try generating AI recommendations again later.',
  };
}

/**
 * Generate a Gemini recommendation with a timeout and fallback.
 *
 * Important: Promise.race limits how long this function waits.
 * It does not cancel the underlying Gemini HTTP request.
 */
async function getRecommendationSafely(payload) {
  let timeoutId;

  try {
    const recommendationPromise = Promise.resolve().then(() =>
      generateRecommendation(payload)
    );

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Gemini timed out after ${GEMINI_TIMEOUT_MS} ms`
          )
        );
      }, GEMINI_TIMEOUT_MS);
    });

    const recommendation = await Promise.race([
      recommendationPromise,
      timeoutPromise,
    ]);

    if (
      recommendation === null ||
      recommendation === undefined ||
      recommendation === ''
    ) {
      throw new Error('Gemini returned an empty recommendation');
    }

    return recommendation;
  } catch (error) {
    console.warn('[Gemini] Recommendation unavailable:', error.message);

    return createFallbackRecommendation(
      payload.disease,
      payload.severityLevel
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a new disease prediction.
 *
 * Pipeline:
 * Original Image -> YOLO -> Severity CNN -> Grad-CAM
 * -> Upload images -> Product matching -> Gemini fallback-safe
 * -> Firestore
 */
async function createPrediction(
  farmerId,
  { farmId, imageBuffer, mimetype, notes }
) {
  if (!farmId) {
    throw Object.assign(new Error('farmId is required'), {
      status: 400,
    });
  }

  if (!imageBuffer || !imageBuffer.length) {
    throw Object.assign(new Error('Leaf image is required'), {
      status: 400,
    });
  }

  // 1. Validate farm ownership.
  const farm = await assertFarmOwner(farmId, farmerId);

  const db = getDb();
  const predictionId = uuidv4();
  const now = new Date().toISOString();

  // 2. Upload the original image.
  const imageUpload = await uploadLeafImage(
    imageBuffer,
    farmerId,
    farmId,
    mimetype || 'image/jpeg'
  );

  // 3. Run the AI pipeline.
  const aiResult = await runDiseasePipeline(imageBuffer, {
    farmId,
    farmerId,
  });

  if (!aiResult || !aiResult.disease) {
    throw new Error(
      'AI service did not return a valid disease prediction.'
    );
  }

  // 4. Normalize severity confidence.
  const severityConfidence = getNumericValue(
    aiResult.severity_confidence,
    aiResult.severityConfidence
  );

  // 5. Upload Grad-CAM image.
  let gradCamUrl = null;

  if (aiResult.gradCamImageBuffer?.length) {
    try {
      const gradCamUpload = await uploadGradCamImage(
        aiResult.gradCamImageBuffer,
        farmerId,
        farmId,
        predictionId
      );

      gradCamUrl = gradCamUpload?.url || null;
    } catch (error) {
      console.error(
        '[Storage] Grad-CAM upload failed:',
        error.message
      );
    }
  }

  // 6. Upload YOLO annotated image.
  let yoloDetectionUrl = null;

  if (aiResult.annotatedImageBuffer?.length) {
    try {
      const yoloUpload = await uploadYoloDetectionImage(
        aiResult.annotatedImageBuffer,
        farmerId,
        farmId,
        predictionId
      );

      yoloDetectionUrl = yoloUpload?.url || null;
    } catch (error) {
      console.error(
        '[Storage] YOLO image upload failed:',
        error.message
      );
    }
  }

  // 7. Load previous disease reports for this farm.
  let previousReports = 'None';

  try {
    const priorSnap = await db
      .collection('predictions')
      .where('farmId', '==', farmId)
      .get();

    previousReports = priorSnap.docs
      .map((doc) => doc.data())
      .filter(
        (prediction) =>
          prediction.disease &&
          prediction.disease.toLowerCase() !== 'healthy'
      )
      .map(
        (prediction) =>
          `${prediction.disease} (${
            prediction.createdAt?.slice(0, 10) || 'unknown date'
          })`
      )
      .slice(0, 5)
      .join('; ') || 'None';
  } catch (error) {
    // A history lookup failure should not block a new prediction.
    console.warn(
      '[Prediction] Previous report lookup failed:',
      error.message
    );
  }

  // 8. Match existing products.
  // This is independent of Gemini, so a Gemini outage cannot
  // prevent product matching.
  let products = [];

  try {
    products = await matchProducts(
      aiResult.disease,
      farm.crop || 'Cotton'
    );
  } catch (error) {
    console.error(
      '[Products] Product matching failed:',
      error.message
    );
  }

  // 9. Generate a recommendation with timeout and fallback.
  const finalSeverityLevel =
    aiResult.severityLevel ||
    severityLevel(aiResult.leafSeverity);

  const recommendation = await getRecommendationSafely({
    disease: aiResult.disease,
    confidence: aiResult.confidence,
    leafSeverity: aiResult.leafSeverity,
    severityLevel: finalSeverityLevel,
    farmName: farm.farmName,
    area: farm.area,
    areaUnit: farm.areaUnit,
    location:
      farm.locationLabel ||
      `${farm.latitude ?? ''},${farm.longitude ?? ''}`,
    previousReports,
    language: 'en',
  });

  // 10. Build the prediction document.
  const prediction = {
    predictionId,
    farmId,
    farmerId,

    disease: aiResult.disease,
    confidence: getNumericValue(aiResult.confidence),
    leafSeverity: getNumericValue(aiResult.leafSeverity),

    severityLevel: finalSeverityLevel,

    severityConfidence,
    severity_confidence: severityConfidence,

    severityProbabilities:
      aiResult.severity_probs ||
      aiResult.severity_probs_json ||
      {},

    affectedRegion: aiResult.affectedRegion || null,
    detections: aiResult.detections || [],

    affectedAreaPercent:
      getNumericValue(
        aiResult.affected_area_percent,
        aiResult.affectedAreaPercent,
        aiResult.leafSeverity
      ) ?? 0,

    // YOLO annotated image and compatibility aliases.
    yoloDetection: {
      available: Boolean(yoloDetectionUrl),
      imageUrl: yoloDetectionUrl,
    },

    yoloDetectionImageUrl: yoloDetectionUrl,
    annotatedImageUrl: yoloDetectionUrl,

    // Grad-CAM image and metadata.
    gradCam: {
      ...(aiResult.gradCam || {}),
      available: Boolean(gradCamUrl),
      imageUrl: gradCamUrl,
    },

    gradCamImageUrl: gradCamUrl,
    gradCamUrl,

    // Gemini recommendation or fallback object.
    recommendation,

    matchingProducts: products.map((product) => ({
      productId: product.productId,
      productName: product.productName,
      manufacturer: product.manufacturer,
      activeIngredient: product.activeIngredient,
      price: product.price,
      stock: product.stock,
      imageUrl: product.imageUrl,
      usageInformation: product.usageInformation,
      targetDisease: product.targetDisease,
      crop: product.crop,
    })),

    imageUrl: imageUpload.url,
    imagePath: imageUpload.path,

    modelInfo: aiResult.modelInfo || {},
    pipeline: aiResult.pipeline || [],
    aiMode: aiResult.mode || 'unknown',

    notes: notes || '',
    createdAt: now,
  };

  // 11. Save prediction.
  await db
    .collection('predictions')
    .doc(predictionId)
    .set(prediction);

  // 12. Save disease report.
  await db
    .collection('diseaseReports')
    .doc(predictionId)
    .set({
      reportId: predictionId,
      predictionId,
      farmId,
      farmerId,
      disease: prediction.disease,
      leafSeverity: prediction.leafSeverity,
      affectedAreaPercent: prediction.affectedAreaPercent,
      severityLevel: prediction.severityLevel,
      confidence: prediction.confidence,
      severityConfidence: prediction.severityConfidence,
      createdAt: now,
    });

  console.log('[Prediction] Saved:', {
    predictionId,
    aiMode: prediction.aiMode,
    severityConfidence: prediction.severityConfidence,
    gradCamAvailable: Boolean(gradCamUrl),
    yoloImageAvailable: Boolean(yoloDetectionUrl),
    matchingProducts: prediction.matchingProducts.length,
    recommendationStatus:
      recommendation?.status || 'generated',
  });

  return prediction;
}

/**
 * Match existing pesticide-owner products from Firestore.
 * Does not create or invent products.
 */
async function matchProducts(disease, crop) {
  const normalize = (value) =>
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');

  const normalizedDisease = normalize(disease);
  const normalizedCrop = normalize(crop || 'Cotton');

  if (
    !normalizedDisease ||
    normalizedDisease === 'healthy'
  ) {
    return [];
  }

  const db = getDb();
  const snap = await db.collection('products').get();

  const allProducts = snap.docs.map((doc) => {
    const data = doc.data();

    return {
      ...data,
      productId: data.productId || doc.id,
    };
  });

  const matchedProducts = allProducts.filter((product) => {
    const productCrop = normalize(product.crop);

    if (productCrop !== normalizedCrop) {
      return false;
    }

    const targets = Array.isArray(product.targetDisease)
      ? product.targetDisease
      : [product.targetDisease];

    const diseaseMatches = targets.some((target) => {
      const normalizedTarget = normalize(target);

      return (
        normalizedTarget &&
        (
          normalizedTarget === normalizedDisease ||
          normalizedTarget.includes(normalizedDisease) ||
          normalizedDisease.includes(normalizedTarget)
        )
      );
    });

    const stock = Number(product.stock ?? 0);

    return (
      diseaseMatches &&
      Number.isFinite(stock) &&
      stock > 0
    );
  });

  const result = matchedProducts.slice(0, 12);

  console.log('[Products] Matching results:', {
    detectedDisease: disease,
    farmCrop: crop || 'Cotton',
    totalProductsInDatabase: allProducts.length,
    matchedProducts: result.length,
    productNames: result.map(
      (product) => product.productName || 'Unnamed product'
    ),
  });

  return result;
}

/**
 * Get a prediction by ID.
 */
async function getPrediction(predictionId, requester) {
  const db = getDb();

  const snap = await db
    .collection('predictions')
    .doc(predictionId)
    .get();

  if (!snap.exists) {
    throw Object.assign(new Error('Prediction not found'), {
      status: 404,
    });
  }

  const prediction = snap.data();

  if (
    requester.role === 'farmer' &&
    prediction.farmerId !== requester.uid
  ) {
    throw Object.assign(new Error('Access denied'), {
      status: 403,
    });
  }

  return prediction;
}

/**
 * List predictions for a farm, newest first.
 */
async function listFarmPredictions(farmId, farmerId) {
  if (!farmId) {
    throw Object.assign(new Error('farmId is required'), {
      status: 400,
    });
  }

  await assertFarmOwner(farmId, farmerId);

  const db = getDb();

  const snapshot = await db
    .collection('predictions')
    .where('farmId', '==', farmId)
    .get();

  return snapshot.docs
    .map((doc) => ({
      ...doc.data(),
      predictionId: doc.data().predictionId || doc.id,
    }))
    .filter((prediction) => prediction.farmerId === farmerId)
    .sort((a, b) =>
      String(b.createdAt || '').localeCompare(
        String(a.createdAt || '')
      )
    );
}

module.exports = {
  createPrediction,
  getPrediction,
  listFarmPredictions,
};
