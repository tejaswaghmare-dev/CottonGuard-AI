const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');
const { calculateFarmArea } = require('../utils/area');

async function createFarm(farmerId, data) {
  const db = getDb();
  const farmId = uuidv4();
  const now = new Date().toISOString();

  let areaInfo = { area: data.area || 0, areaUnit: data.areaUnit || 'acres', areaSqMeters: null };
  if (data.boundary && data.boundary.length >= 3) {
    areaInfo = calculateFarmArea(data.boundary, data.areaUnit || 'acres');
  }

  const farm = {
    farmId,
    farmerId,
    farmName: data.farmName || 'My Farm',
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    locationLabel: data.locationLabel || '',
    boundary: data.boundary || [],
    area: areaInfo.area,
    areaUnit: areaInfo.areaUnit,
    areaSqMeters: areaInfo.areaSqMeters,
    crop: data.crop || 'Cotton',
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('farms').doc(farmId).set(farm);
  return farm;
}

async function listFarms(farmerId) {
  const db = getDb();
  const snap = await db.collection('farms').where('farmerId', '==', farmerId).get();
  const farms = snap.docs.map((d) => d.data());
  farms.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return farms;
}

async function getFarm(farmId) {
  const db = getDb();
  const snap = await db.collection('farms').doc(farmId).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function assertFarmOwner(farmId, farmerId) {
  const farm = await getFarm(farmId);
  if (!farm) {
    throw Object.assign(new Error('Farm not found'), { status: 404 });
  }
  if (farm.farmerId !== farmerId) {
    throw Object.assign(new Error('You do not own this farm'), { status: 403 });
  }
  return farm;
}

async function updateFarm(farmId, farmerId, data) {
  const farm = await assertFarmOwner(farmId, farmerId);
  const db = getDb();
  const updates = { updatedAt: new Date().toISOString() };

  ['farmName', 'latitude', 'longitude', 'locationLabel', 'crop', 'areaUnit'].forEach((k) => {
    if (data[k] !== undefined) updates[k] = data[k];
  });

  if (data.boundary) {
    updates.boundary = data.boundary;
    const areaInfo = calculateFarmArea(data.boundary, data.areaUnit || farm.areaUnit || 'acres');
    updates.area = areaInfo.area;
    updates.areaUnit = areaInfo.areaUnit;
    updates.areaSqMeters = areaInfo.areaSqMeters;
  } else if (data.area !== undefined) {
    updates.area = Number(data.area);
  }

  await db.collection('farms').doc(farmId).update(updates);
  return { ...farm, ...updates };
}

async function deleteFarm(farmId, farmerId) {
  await assertFarmOwner(farmId, farmerId);
  const db = getDb();
  await db.collection('farms').doc(farmId).delete();
  return { farmId, deleted: true };
}

module.exports = {
  createFarm,
  listFarms,
  getFarm,
  assertFarmOwner,
  updateFarm,
  deleteFarm,
};
