
import { useCallback, useEffect, useState } from 'react';
import { farmsApi, mandiPricesApi } from '../../services/api';

const initialFilters = {
  state: 'Maharashtra',
  district: '',
  market: '',
  commodity: 'Cotton',
};

const formatPrice = (value) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? `₹${number.toLocaleString('en-IN')}`
    : value;
};

const formatDistance = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'Unavailable';
  }

  return `${Number(value).toFixed(1)} km`;
};

const formatDuration = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'Unavailable';
  }

  const minutes = Math.round(Number(value));

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${hours} hr ${remainingMinutes} min`
    : `${hours} hr`;
};

export default function MandiPrices() {
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState('');
  const [farmsLoading, setFarmsLoading] = useState(true);
  const [farmError, setFarmError] = useState('');

  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);

  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load farms belonging to the logged-in farmer.
  useEffect(() => {
    let active = true;

    async function loadFarms() {
      setFarmsLoading(true);
      setFarmError('');

      try {
        const result = await farmsApi.list();
        const list = Array.isArray(result.farms) ? result.farms : [];

        if (!active) return;

        setFarms(list);

        if (list.length > 0) {
          setFarmId((current) => {
            if (current && list.some((farm) => farm.farmId === current)) {
              return current;
            }

            return list[0].farmId;
          });
        }
      } catch (err) {
        if (active) {
          setFarmError(
            err.response?.data?.message ||
            err.message ||
            'Unable to load your farms.'
          );
        }
      } finally {
        if (active) setFarmsLoading(false);
      }
    }

    loadFarms();

    return () => {
      active = false;
    };
  }, []);

  const fetchPrices = useCallback(async (currentFilters, currentFarmId) => {
    setLoading(true);
    setError('');

    try {
      const params = {
        limit: 50,
        ...Object.fromEntries(
          Object.entries(currentFilters).filter(
            ([, value]) =>
              value !== null &&
              value !== undefined &&
              String(value).trim() !== ''
          )
        ),
      };

      // Sending farmId enables the backend road-distance calculation.
      if (currentFarmId) {
        params.farmId = currentFarmId;
      }

      const result = await mandiPricesApi.list(params);

      setRecords(Array.isArray(result.records) ? result.records : []);
      setTotal(Number(result.total) || 0);
    } catch (err) {
      setRecords([]);
      setTotal(0);
      setError(
        err.response?.data?.message ||
        err.message ||
        'Unable to load market prices. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the selected farm or applied filters change.
  useEffect(() => {
    if (farmsLoading || !farmId) return;

    fetchPrices(appliedFilters, farmId);
  }, [farmId, appliedFilters, farmsLoading, fetchPrices]);

  const selectedFarm = farms.find((farm) => farm.farmId === farmId);

  const changeFilter = (event) => {
    const { name, value } = event.target;

    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const applyFilters = (event) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
  };

  const validPrices = records
    .map((record) => Number(record.modalPrice))
    .filter((price) => Number.isFinite(price) && price > 0);

  const averageModalPrice = validPrices.length
    ? validPrices.reduce((sum, price) => sum + price, 0) /
      validPrices.length
    : null;

  const nearestMandi = records.find(
    (record) => record.roadDistanceKm !== null &&
      record.roadDistanceKm !== undefined &&
      Number.isFinite(Number(record.roadDistanceKm))
  );

  const refreshPrices = () => fetchPrices(appliedFilters, farmId);

  return (
    <main className="mandi-page">
      <section className="mandi-heading">
        <div>
          <p className="mandi-eyebrow">
            COTTONGUARD AI • FARMER TOOLS
          </p>
          <h1>Cotton Mandi Prices</h1>
          <p className="mandi-subtitle">
            Compare reported cotton prices and find mandis by driving distance
            from your farm.
          </p>
        </div>

        <button
          type="button"
          className="mandi-refresh"
          onClick={refreshPrices}
          disabled={loading || !farmId}
        >
          {loading ? 'Loading…' : '↻ Refresh prices'}
        </button>
      </section>

      <section className="mandi-panel">
        <div className="mandi-panel-heading">
          <div>
            <h2>Select your farm</h2>
            <p>
              Distances are calculated from the selected farm's saved
              coordinates.
            </p>
          </div>
        </div>

        {farmsLoading && (
          <div className="mandi-empty">Loading your farms…</div>
        )}

        {!farmsLoading && farmError && (
          <div className="mandi-error" role="alert">
            <strong>Could not load farms</strong>
            <p>{farmError}</p>
          </div>
        )}

        {!farmsLoading && !farmError && farms.length === 0 && (
          <div className="mandi-empty">
            <strong>No saved farms found.</strong>
            <p>
              Add a farm and save its location before searching for the
              nearest cotton mandis.
            </p>
          </div>
        )}

        {!farmsLoading && farms.length > 0 && (
          <div className="mandi-farm-select">
            <label htmlFor="mandi-farm">
              Choose farm
              <select
                id="mandi-farm"
                value={farmId}
                onChange={(event) => setFarmId(event.target.value)}
              >
                {farms.map((farm) => (
                  <option key={farm.farmId} value={farm.farmId}>
                    {farm.farmName || 'My Farm'}
                    {farm.locationLabel ? ` — ${farm.locationLabel}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {selectedFarm && (
              <div className="mandi-farm-details">
                <span>
                  <strong>Farm:</strong>{' '}
                  {selectedFarm.farmName || 'My Farm'}
                </span>
                <span>
                  <strong>Area:</strong>{' '}
                  {selectedFarm.area ?? '—'} {selectedFarm.areaUnit || 'acres'}
                </span>
                <span>
                  <strong>Coordinates:</strong>{' '}
                  {Number.isFinite(Number(selectedFarm.latitude)) &&
                  Number.isFinite(Number(selectedFarm.longitude))
                    ? `${Number(selectedFarm.latitude).toFixed(5)}, ${Number(
                        selectedFarm.longitude
                      ).toFixed(5)}`
                    : 'Not saved'}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mandi-stats">
        <article className="mandi-stat">
          <span>Nearest located mandi</span>
          <strong className="mandi-stat-text">
            {loading ? '—' : nearestMandi?.market || '—'}
          </strong>
          <small>
            {loading
              ? 'Calculating road distance…'
              : nearestMandi
                ? formatDistance(nearestMandi.roadDistanceKm)
                : 'No route available'}
          </small>
        </article>

        <article className="mandi-stat">
          <span>Average modal price</span>
          <strong>
            {loading
              ? '—'
              : averageModalPrice === null
                ? '—'
                : formatPrice(Math.round(averageModalPrice))}
          </strong>
          <small>₹ per quintal, based on returned records</small>
        </article>

        <article className="mandi-stat">
          <span>Matching records</span>
          <strong>{loading ? '—' : total.toLocaleString('en-IN')}</strong>
          <small>Records reported by the price API</small>
        </article>
      </section>

      <section className="mandi-panel">
        <div className="mandi-panel-heading">
          <div>
            <h2>Find market prices</h2>
            <p>Filter by state, district, market, or commodity.</p>
          </div>
        </div>

        <form className="mandi-filters" onSubmit={applyFilters}>
          <label>
            State
            <input
              name="state"
              value={filters.state}
              onChange={changeFilter}
              placeholder="e.g. Maharashtra"
            />
          </label>

          <label>
            District
            <input
              name="district"
              value={filters.district}
              onChange={changeFilter}
              placeholder="e.g. Yavatmal"
            />
          </label>

          <label>
            Market / Mandi
            <input
              name="market"
              value={filters.market}
              onChange={changeFilter}
              placeholder="Market name"
            />
          </label>

          <label>
            Commodity
            <input
              name="commodity"
              value={filters.commodity}
              onChange={changeFilter}
              placeholder="e.g. Cotton"
            />
          </label>

          <div className="mandi-filter-actions">
            <button type="submit" disabled={loading || !farmId}>
              Apply filters
            </button>

            <button
              type="button"
              className="mandi-reset"
              onClick={resetFilters}
              disabled={loading}
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      <section className="mandi-panel">
        <div className="mandi-panel-heading mandi-table-heading">
          <div>
            <h2>Market price records</h2>
            <p>
              Sorted by driving distance when a route is available. Prices
              are in rupees per quintal.
            </p>
          </div>
          <span className="mandi-live-label">AGMARKNET DATA</span>
        </div>

        {error && (
          <div className="mandi-error" role="alert">
            <strong>Could not load prices</strong>
            <p>{error}</p>
            <button type="button" onClick={refreshPrices}>
              Try again
            </button>
          </div>
        )}

        {loading && (
          <div className="mandi-empty">
            Fetching prices and calculating driving distances. The first
            lookup can take longer while market locations are found.
          </div>
        )}

        {!loading && !error && records.length === 0 && farmId && (
          <div className="mandi-empty">
            <strong>No matching prices found.</strong>
            <p>
              Try removing the district or market filter, or check another
              commodity spelling.
            </p>
          </div>
        )}

        {!loading && !error && records.length > 0 && (
          <div className="mandi-table-wrap">
            <table className="mandi-table">
              <thead>
                <tr>
                  <th>Market / District</th>
                  <th>Road distance</th>
                  <th>Drive time</th>
                  <th>Commodity</th>
                  <th>Arrival date</th>
                  <th>Min. price</th>
                  <th>Max. price</th>
                  <th>Modal price</th>
                  <th>Directions</th>
                </tr>
              </thead>

              <tbody>
                {records.map((record, index) => (
                  <tr
                    key={[
                      record.state,
                      record.district,
                      record.market,
                      record.commodity,
                      record.arrivalDate,
                      index,
                    ].join('-')}
                  >
                    <td>
                      <strong>{record.market || '—'}</strong>
                      <small>
                        {[record.district, record.state]
                          .filter(Boolean)
                          .join(', ')}
                      </small>
                    </td>

                    <td className="mandi-distance">
                      {formatDistance(record.roadDistanceKm)}
                    </td>

                    <td>{formatDuration(record.drivingMinutes)}</td>
                    <td>{record.commodity || '—'}</td>
                    <td>{record.arrivalDate || '—'}</td>
                    <td>{formatPrice(record.minPrice)}</td>
                    <td>{formatPrice(record.maxPrice)}</td>

                    <td>
                      <strong className="mandi-modal-price">
                        {formatPrice(record.modalPrice)}
                      </strong>
                    </td>

                    <td>
                      {record.directionsUrl ? (
                        <a
                          className="mandi-directions"
                          href={record.directionsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Get directions ↗
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mandi-disclaimer">
          Road distances and driving times are estimates based on available
          routing data. Market locations may be approximate. Prices and
          arrival dates depend on published source records and may not
          represent today's rate. Confirm the latest price with your local
          mandi before selling.
        </p>
      </section>
    </main>
  );
}
