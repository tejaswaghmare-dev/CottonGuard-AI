const farmService = require('../services/farm.service');

async function create(req, res, next) {
  try {
    const farm = await farmService.createFarm(req.user.uid, req.body);
    res.status(201).json({ success: true, farm });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const farms = await farmService.listFarms(req.user.uid);
    res.json({ success: true, farms });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const farm = await farmService.assertFarmOwner(req.params.farmId, req.user.uid);
    res.json({ success: true, farm });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const farm = await farmService.updateFarm(req.params.farmId, req.user.uid, req.body);
    res.json({ success: true, farm });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const result = await farmService.deleteFarm(req.params.farmId, req.user.uid);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove };
