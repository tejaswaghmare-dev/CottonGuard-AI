
const mandiPriceService = require('../services/mandiPrice.service');
const farmService = require('../services/farm.service');

async function list(req, res, next) {
  try {
    const { farmId, ...filters } = req.query;

    let farm = null;

    // Farm coordinates are optional for existing dashboard requests.
    if (farmId) {
      farm = await farmService.assertFarmOwner(
        farmId,
        req.user.uid
      );

      if (
        !Number.isFinite(Number(farm.latitude)) ||
        !Number.isFinite(Number(farm.longitude))
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This farm does not have valid coordinates. Please update its location first.',
        });
      }
    }

    const result = await mandiPriceService.getMandiPrices(
      filters,
      farm
        ? {
            latitude: Number(farm.latitude),
            longitude: Number(farm.longitude),
          }
        : null
    );

    res.json({
      success: true,
      farm: farm
        ? {
            farmId: farm.farmId,
            farmName: farm.farmName,
            latitude: farm.latitude,
            longitude: farm.longitude,
          }
        : null,
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { list };
