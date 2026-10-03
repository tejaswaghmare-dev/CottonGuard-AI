/**
 * Approximate polygon area using the spherical excess / shoelace formula
 * for lat/lng coordinates. Returns area in square meters.
 */
function polygonAreaSqMeters(coordinates) {
  if (!coordinates || coordinates.length < 3) return 0;

  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;

  let area = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = toRad(coordinates[i].lat);
    const lng1 = toRad(coordinates[i].lng);
    const lat2 = toRad(coordinates[j].lat);
    const lng2 = toRad(coordinates[j].lng);
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs((area * R * R) / 2);
  return area;
}

function sqMetersToAcres(sqm) {
  return sqm / 4046.8564224;
}

function sqMetersToHectares(sqm) {
  return sqm / 10000;
}

function calculateFarmArea(coordinates, unit = 'acres') {
  const sqm = polygonAreaSqMeters(coordinates);
  if (unit === 'hectares') {
    return { area: Number(sqMetersToHectares(sqm).toFixed(3)), areaUnit: 'hectares', areaSqMeters: Math.round(sqm) };
  }
  return { area: Number(sqMetersToAcres(sqm).toFixed(3)), areaUnit: 'acres', areaSqMeters: Math.round(sqm) };
}

module.exports = {
  polygonAreaSqMeters,
  sqMetersToAcres,
  sqMetersToHectares,
  calculateFarmArea,
};
