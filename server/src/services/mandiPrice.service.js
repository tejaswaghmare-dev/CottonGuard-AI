
const axios = require('axios');

const API_URL =
  'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';

const OSRM_URL = 'https://router.project-osrm.org';

const geocodeCache = new Map();
let lastGeocodeTime = 0;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function geocodeMarket(record) {
  const queries = [
    [record.market, record.district, record.state, 'India'],
    [record.market, record.state, 'India'],
  ]
    .map((parts) => parts.filter(Boolean).join(', '))
    .filter((query, index, all) => all.indexOf(query) === index);

  for (const query of queries) {
    const cacheKey = query.toLowerCase();

    if (geocodeCache.has(cacheKey)) {
      const cached = geocodeCache.get(cacheKey);
      if (cached) return cached;
      continue;
    }

    const wait = Math.max(
      0,
      1100 - (Date.now() - lastGeocodeTime)
    );

    if (wait > 0) await sleep(wait);

    lastGeocodeTime = Date.now();

    try {
      const response = await axios.get(
        'https://nominatim.openstreetmap.org/search',
        {
          params: {
            q: query,
            format: 'jsonv2',
            limit: 1,
            countrycodes: 'in',
          },
          headers: {
            'User-Agent': 'CottonGuardAI/1.0 (mandi price prototype)',
          },
          timeout: 12000,
        }
      );

      const first = response.data?.[0];

      if (
        first &&
        Number.isFinite(Number(first.lat)) &&
        Number.isFinite(Number(first.lon))
      ) {
        const location = {
          latitude: Number(first.lat),
          longitude: Number(first.lon),
        };

        geocodeCache.set(cacheKey, location);
        return location;
      }
    } catch (error) {
      console.error(
        '[Nominatim] Geocoding failed:',
        query,
        error.response?.status || error.message
      );
    }

    // Fallback geocoder.
    try {
      const response = await axios.get(
        'https://photon.komoot.io/api/',
        {
          params: {
            q: query,
            limit: 1,
            lang: 'en',
          },
          headers: {
            'User-Agent': 'CottonGuardAI/1.0',
          },
          timeout: 12000,
        }
      );

      const coordinates =
        response.data?.features?.[0]?.geometry?.coordinates;

      if (
        Array.isArray(coordinates) &&
        Number.isFinite(Number(coordinates[0])) &&
        Number.isFinite(Number(coordinates[1]))
      ) {
        const location = {
          longitude: Number(coordinates[0]),
          latitude: Number(coordinates[1]),
        };

        geocodeCache.set(cacheKey, location);
        return location;
      }
    } catch (error) {
      console.error(
        '[Photon] Geocoding failed:',
        query,
        error.response?.status || error.message
      );
    }

    geocodeCache.set(cacheKey, null);
  }

  console.warn(
    '[Mandi Geocoding] No coordinates found:',
    record.market,
    record.district,
    record.state
  );

  return null;
}

async function addRoadDistances(records, farm) {
  if (!farm || records.length === 0) return records;

  const farmLatitude = Number(farm.latitude);
  const farmLongitude = Number(farm.longitude);

  if (
    !Number.isFinite(farmLatitude) ||
    !Number.isFinite(farmLongitude)
  ) {
    throw Object.assign(
      new Error('The selected farm has invalid coordinates.'),
      { status: 400 }
    );
  }

  // Geocode each unique market once.
  const locations = new Map();

  for (const record of records) {
    const key = [
      record.market,
      record.district,
      record.state,
    ]
      .join('|')
      .toLowerCase();

    if (!locations.has(key)) {
      const coordinates = await geocodeMarket(record);
      locations.set(key, coordinates);
    }

    record._locationKey = key;
  }

  const destinations = [
    ...new Map(
      [...locations.entries()]
        .filter(([, point]) => point)
        .map(([key, point]) => [key, { key, ...point }])
    ).values(),
  ];

  if (destinations.length === 0) {
    return records.map(({ _locationKey, ...record }) => ({
      ...record,
      mandiLatitude: null,
      mandiLongitude: null,
      roadDistanceKm: null,
      drivingMinutes: null,
      directionsUrl: null,
    }));
  }

  // OSRM expects longitude,latitude.
  const coordinates = [
    `${farmLongitude},${farmLatitude}`,
    ...destinations.map(
      (point) => `${point.longitude},${point.latitude}`
    ),
  ].join(';');

  const destinationIndexes = destinations
    .map((_, index) => index + 1)
    .join(';');

  let routes = [];

  try {
    const response = await axios.get(
      `${OSRM_URL}/table/v1/driving/${coordinates}`,
      {
        params: {
          sources: '0',
          destinations: destinationIndexes,
          annotations: 'distance,duration',
        },
        timeout: 20000,
      }
    );

    if (response.data?.code === 'Ok') {
      routes = destinations.map((point, index) => ({
        key: point.key,
        distance: response.data.distances?.[0]?.[index],
        duration: response.data.durations?.[0]?.[index],
      }));
    } else {
      console.error(
        '[Mandi Routing] OSRM returned:',
        response.data?.code || 'Unknown error'
      );
    }
  } catch (error) {
    console.error(
      '[Mandi Routing] Failed:',
      error.response?.data?.code || error.message
    );
  }

  const routeMap = new Map(
    routes.map((route) => [route.key, route])
  );

  return records
    .map(({ _locationKey, ...record }) => {
      const point = locations.get(_locationKey);
      const route = routeMap.get(_locationKey);

      const hasRoute =
        point &&
        route &&
        Number.isFinite(route.distance) &&
        Number.isFinite(route.duration);

      // IMPORTANT:
      // Google Maps uses the SAME destination coordinates
      // that were supplied to OSRM.
      const directionsUrl =
        point &&
        record.market
          ? `https://www.google.com/maps/dir/?api=1&origin=${farmLatitude},${farmLongitude}&destination=${point.latitude},${point.longitude}&travelmode=driving`
          : null;

      return {
        ...record,

        // Exact coordinates used for routing.
        mandiLatitude: point?.latitude ?? null,
        mandiLongitude: point?.longitude ?? null,

        roadDistanceKm: hasRoute
          ? Number((route.distance / 1000).toFixed(1))
          : null,

        drivingMinutes: hasRoute
          ? Math.round(route.duration / 60)
          : null,

        directionsUrl,
      };
    })
    .sort((a, b) => {
      if (a.roadDistanceKm == null && b.roadDistanceKm == null) {
        return 0;
      }
      if (a.roadDistanceKm == null) return 1;
      if (b.roadDistanceKm == null) return -1;

      return a.roadDistanceKm - b.roadDistanceKm;
    });
}

async function getMandiPrices(filters = {}, farm = null) {
  const apiKey = process.env.AGMARKNET_API_KEY;

  if (!apiKey) {
    throw Object.assign(
      new Error('AGMARKNET_API_KEY is missing from server/.env'),
      { status: 500 }
    );
  }

  const params = {
    'api-key': apiKey,
    format: 'json',
    limit: Math.min(
      Math.max(Number(filters.limit) || 20, 1),
      50
    ),
    offset: Math.max(Number(filters.offset) || 0, 0),
  };

  if (filters.state) {
    params['filters[state.keyword]'] = filters.state;
  }
  if (filters.district) {
    params['filters[district]'] = filters.district;
  }
  if (filters.market) {
    params['filters[market]'] = filters.market;
  }
  if (filters.commodity) {
    params['filters[commodity]'] = filters.commodity;
  }
  if (filters.variety) {
    params['filters[variety]'] = filters.variety;
  }
  if (filters.grade) {
    params['filters[grade]'] = filters.grade;
  }

  try {
    const response = await axios.get(API_URL, {
      params,
      timeout: 15000,
    });

    const records = (response.data.records || []).map((r) => ({
      state: r.state || '',
      district: r.district || '',
      market: r.market || '',
      commodity: r.commodity || '',
      variety: r.variety || '',
      grade: r.grade || '',
      arrivalDate: r.arrival_date || '',
      minPrice: r.min_price ?? null,
      maxPrice: r.max_price ?? null,
      modalPrice: r.modal_price ?? null,
    }));

    const processedRecords = farm
      ? await addRoadDistances(records, farm)
      : records;

    return {
      total: Number(response.data.total) || 0,
      count: processedRecords.length,
      records: processedRecords,
    };
  } catch (error) {
    if (error.status) throw error;

    console.error(
      '[Mandi Prices] API request failed:',
      error.response?.status || error.code || error.message
    );

    throw Object.assign(
      new Error(
        error.response?.status === 403
          ? 'Government API access denied. Check your API key and permissions.'
          : error.response?.status === 400
            ? 'Invalid mandi-price filters.'
            : 'Unable to fetch mandi prices. Please try again later.'
      ),
      { status: 502 }
    );
  }
}

module.exports = { getMandiPrices };
