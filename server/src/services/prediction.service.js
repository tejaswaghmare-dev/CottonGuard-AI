const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');
const { assertFarmOwner } = require('./farm.service');
const { runDiseasePipeline } = require('./aiModel.service');
const { uploadLeafImage, uploadGradCamImage } = require('./storage.service');
const { estimateFarmSpread, computeSpreadRisk, severityLevel } = require('../utils/severity');
const { generateRecommendation } = require('./gemini.service');

async function createPrediction(farmerId, { farmId, imageBuffer, mimetype, notes }) {
  const farm = await assertFarmOwner(farmId, farmerId);
  const db = getDb();
  const predictionId = uuidv4();
  const now = new Date().toISOString();

  // Upload leaf image
  const imageUpload = await uploadLeafImage(imageBuffer, farmerId, farmId, mimetype || 'image/jpeg');

  // Run AI pipeline (YOLOv8 → EfficientNetB0 → severity → Grad-CAM)
  const aiResult = await runDiseasePipeline(imageBuffer, { farmId, farmerId });

  // Optional Grad-CAM image buffer from python service
  let gradCamUrl = null;
  if (aiResult.gradCamImageBuffer) {
    const gc = await uploadGradCamImage(aiResult.gradCamImageBuffer, farmerId, farmId, predictionId);
    gradCamUrl = gc.url;
  }

  // Prior predictions for this farm (for spread + risk)
  const priorSnap = await db
    .collection('predictions')
    .where('farmId', '==', farmId)
    .get();
  const prior = priorSnap.docs.map((d) => d.data());
  const allForSpread = [
    ...prior,
    {
      disease: aiResult.disease,
      leafSeverity: aiResult.leafSeverity,
    },
  ];

  const spread = estimateFarmSpread(allForSpread);
  const historyDiseased = prior.filter(
    (p) => p.disease && p.disease.toLowerCase() !== 'healthy'
  ).length;
  const risk = computeSpreadRisk({
    spreadPercent: spread.estimatedSpreadPercent,
    avgSeverity: spread.avgLeafSeverity,
    diseasedCount: spread.diseasedSamples,
    historyDiseasedCount: historyDiseased,
  });

  // Gemini recommendation (no fake products)
  const previousReports = prior
    .filter((p) => p.disease && p.disease.toLowerCase() !== 'healthy')
    .map((p) => `${p.disease} (${p.createdAt?.slice(0, 10)})`)
    .slice(0, 5)
    .join('; ') || 'None';

  const recommendation = await generateRecommendation({
    disease: aiResult.disease,
    confidence: aiResult.confidence,
    leafSeverity: aiResult.leafSeverity,
    severityLevel: aiResult.severityLevel,
    estimatedSpreadPercent: spread.estimatedSpreadPercent,
    spreadRisk: risk.risk,
    farmName: farm.farmName,
    area: farm.area,
    areaUnit: farm.areaUnit,
    location: farm.locationLabel || `${farm.latitude},${farm.longitude}`,
    previousReports,
    samplesAnalyzed: spread.samplesAnalyzed,
    language: 'en',
  });

  // Matching products from Firestore (verified catalogue only)
  const products = await matchProducts(aiResult.disease, farm.crop || 'Cotton');

  const prediction = {
    predictionId,
    farmId,
    farmerId,
    disease: aiResult.disease,
    confidence: aiResult.confidence,
    leafSeverity: aiResult.leafSeverity,
    severityLevel: aiResult.severityLevel || severityLevel(aiResult.leafSeverity),
    affectedRegion: aiResult.affectedRegion,
    detections: aiResult.detections || [],
    severityProbabilities: aiResult.severity_probs || {},
    affectedAreaPercent: aiResult.affected_area_percent ?? aiResult.leafSeverity ?? 0,
    gradCam: {
      ...aiResult.gradCam,
      imageUrl: gradCamUrl,
    },
    estimatedFarmSpread: spread,
    spreadRisk: risk,
    recommendation,
    matchingProducts: products.map((p) => ({
      productId: p.productId,
      productName: p.productName,
      manufacturer: p.manufacturer,
      activeIngredient: p.activeIngredient,
      price: p.price,
      stock: p.stock,
      imageUrl: p.imageUrl,
      usageInformation: p.usageInformation,
    })),
    imageUrl: imageUpload.url,
    imagePath: imageUpload.path,
    notes: notes || '',
    modelInfo: aiResult.modelInfo,
    pipeline: aiResult.pipeline,
    aiMode: aiResult.mode,
    createdAt: now,
  };

  await db.collection('predictions').doc(predictionId).set(prediction);

  // Also write a diseaseReports summary entry
  await db.collection('diseaseReports').doc(predictionId).set({
    reportId: predictionId,
    farmId,
    farmerId,
    disease: prediction.disease,
    leafSeverity: prediction.leafSeverity,
    estimatedSpreadPercent: spread.estimatedSpreadPercent,
    spreadRisk: risk.risk,
    createdAt: now,
  });

  return prediction;
}

async function matchProducts(disease, crop) {
  if (!disease || disease.toLowerCase() === 'healthy') return [];
  const db = getDb();
  const snap = await db.collection('products').where('crop', '==', crop || 'Cotton').get();
  const all = snap.docs.map((d) => d.data());
  // Filter by target disease (case-insensitive contains)
  const diseaseLower = disease.toLowerCase();
  return all
    .filter((p) => {
      const targets = Array.isArray(p.targetDisease)
        ? p.targetDisease
        : [p.targetDisease || ''];
      return targets.some((t) => String(t).toLowerCase().includes(diseaseLower) || diseaseLower.includes(String(t).toLowerCase()));
    })
    .filter((p) => (p.stock ?? 0) > 0)
    .slice(0, 12);
}

async function getPrediction(predictionId, requester) {
  const db = getDb();
  const snap = await db.collection('predictions').doc(predictionId).get();
  if (!snap.exists) {
    throw Object.assign(new Error('Prediction not found'), { status: 404 });
  }
  const pred = snap.data();

  // Farmer: own only. Doctor: if shared via consultation. Admin roles later.
  if (requester.role === 'farmer' && pred.farmerId !== requester.uid) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  return pred;
}

async function listFarmPredictions(farmId, farmerId) {
  await assertFarmOwner(farmId, farmerId);
  const db = getDb();
  const snap = await db.collection('predictions').where('farmId', '==', farmId).get();
  const list = snap.docs.map((d) => d.data());
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

async function getFarmSpreadSummary(farmId, farmerId) {
  const predictions = await listFarmPredictions(farmId, farmerId);
  const spread = estimateFarmSpread(predictions);
  const historyDiseased = predictions.filter(
    (p) => p.disease && p.disease.toLowerCase() !== 'healthy'
  ).length;
  const risk = computeSpreadRisk({
    spreadPercent: spread.estimatedSpreadPercent,
    avgSeverity: spread.avgLeafSeverity,
    diseasedCount: spread.diseasedSamples,
    historyDiseasedCount: historyDiseased,
  });
  return { farmId, spread, risk, predictionsCount: predictions.length };
}

module.exports = {
  createPrediction,
  getPrediction,
  listFarmPredictions,
  getFarmSpreadSummary,
  matchProducts,
};
