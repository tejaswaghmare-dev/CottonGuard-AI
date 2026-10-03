const predictionService = require('../services/prediction.service');
const { generateRecommendation } = require('../services/gemini.service');

async function create(req, res, next) {
  try {
    const farmId = req.body.farmId;
    if (!farmId) {
      return res.status(400).json({ success: false, message: 'farmId is required' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Leaf image is required' });
    }

    const prediction = await predictionService.createPrediction(req.user.uid, {
      farmId,
      imageBuffer: req.file.buffer,
      mimetype: req.file.mimetype,
      notes: req.body.notes,
    });

    res.status(201).json({ success: true, prediction });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const prediction = await predictionService.getPrediction(req.params.predictionId, req.user);
    res.json({ success: true, prediction });
  } catch (err) {
    next(err);
  }
}

async function listByFarm(req, res, next) {
  try {
    const predictions = await predictionService.listFarmPredictions(req.params.farmId, req.user.uid);
    res.json({ success: true, predictions });
  } catch (err) {
    next(err);
  }
}

async function farmSpread(req, res, next) {
  try {
    const summary = await predictionService.getFarmSpreadSummary(req.params.farmId, req.user.uid);
    res.json({ success: true, ...summary });
  } catch (err) {
    next(err);
  }
}

async function recommendation(req, res, next) {
  try {
    const result = await generateRecommendation(req.body || {});
    res.json({ success: true, recommendation: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, getOne, listByFarm, farmSpread, recommendation };
