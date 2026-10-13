
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { farmsApi, mandiPricesApi } from '../../services/api';

const galleryImages = [
  {
    src: '/images/cottonfileds.jpg',
    title: 'Healthy Fields',
    description: 'Keep track of your farm and crops.',
  },
  {
    src: '/images/Smart Farming.jpg',
    title: 'Smart Farming',
    description: 'Make informed crop-care decisions.',
  },
  {
    src: '/images/planthealth.jpg',
    title: 'Plant Health',
    description: 'Check leaves for signs of disease.',
  },
  {
    src: '/images/betterharvest.jpg',
    title: 'Better Harvests',
    description: 'Support healthier growing seasons.',
  },
];

const farmImages = [
  '/images/farm-a.jpg',
  '/images/farm-b.jpg',
  '/images/farm-c.jpg',
  '/images/cotton-leaf.jpg',
  '/images/healthy-cotton.jpg',
];

export default function FarmerDashboard() {
  const { profile, quota, refreshProfile } = useAuth();
  const { t } = useLanguage();

  const [farms, setFarms] = useState([]);
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [marketPrices, setMarketPrices] = useState([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        await refreshProfile();

        const { farms: list } = await farmsApi.list();

        if (!mounted) return;

        const farmList = list || [];
        setFarms(farmList);

        if (farmList[0]) {
          const { predictions } = await farmsApi.predictions(
            farmList[0].farmId
          );

          if (mounted) {
            setLatest(predictions?.[0] || null);
          }
        }
      } catch (err) {
        console.error('Failed to load farmer dashboard:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadMarketPrices() {
      try {
        setMarketLoading(true);
        setMarketError('');

        const result = await mandiPricesApi.list({
          state: 'Maharashtra',
          commodity: 'Cotton',
          limit: 5,
        });

        if (mounted) {
          setMarketPrices(result.records || []);
        }
      } catch (err) {
        if (mounted) {
          setMarketError(
            err.response?.data?.message ||
              err.message ||
              'Unable to load market prices.'
          );
        }
      } finally {
        if (mounted) {
          setMarketLoading(false);
        }
      }
    }

    loadMarketPrices();

    return () => {
      mounted = false;
    };
  }, []);

  const remaining = quota?.remaining ?? '—';
  const rec = latest?.recommendation?.immediateActions?.[0];

  return (
    <div className="page farmer-dashboard">
      <div className="container">
        {/* HERO SECTION */}
        <section className="farmer-hero">
          <div className="farmer-hero-content">
            <span className="hero-tag">
              <span className="hero-status-dot" />
              AI-POWERED AGRICULTURE
            </span>

            <h1>
              Grow smarter.
              <br />
              <span>Harvest better.</span>
            </h1>

            <p>
              Welcome back, {profile?.displayName || 'Farmer'}!
              Manage your cotton farms, analyse leaf diseases, and
              get intelligent crop-care recommendations in one place.
            </p>

            <div className="farmer-hero-actions">
              <Link to="/farms/new" className="btn btn-lg">
                + Add New Farm
              </Link>

              <Link to="/doctors" className="hero-secondary-btn">
                Consult a Doctor →
              </Link>
            </div>

            <div className="hero-trust">
              <span>🌱 Farm monitoring</span>
              <span>🔬 AI leaf analysis</span>
            </div>
          </div>

          <div className="farmer-hero-decoration" aria-hidden="true">
            <div className="hero-orbit hero-orbit-one" />
            <div className="hero-orbit hero-orbit-two" />
            <div className="hero-leaf">🌿</div>

            <div className="hero-floating-card">
              <span className="floating-icon">✦</span>
              <div>
                <strong>Smart Agriculture</strong>
                <small>Insights for your farm</small>
              </div>
            </div>
          </div>
        </section>

        {/* ANIMATED IMAGE GALLERY */}
        <section className="farm-gallery-section">
          <div className="gallery-heading">
            <div>
              <span className="eyebrow">INSPIRED BY NATURE</span>
              <h2>Growing a healthier future</h2>
              <p className="muted">
                Better insights for every growing season.
              </p>
            </div>

            <span className="gallery-counter">01 — 04</span>
          </div>

          <div
            className="farm-gallery-viewport"
            aria-label="Agriculture image gallery"
          >
            <div className="farm-gallery-track">
              {[...galleryImages, ...galleryImages].map(
                (image, index) => (
                  <article
                    className="farm-gallery-card"
                    key={`${image.title}-${index}`}
                  >
                    <img
                      src={image.src}
                      alt={image.title}
                      loading={index < 4 ? 'eager' : 'lazy'}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src =
                          '/images/cotton-farm.jpg';
                      }}
                    />

                    <div className="gallery-image-shade" />

                    <div className="gallery-card-content">
                      <span className="gallery-number">
                        {String((index % 4) + 1).padStart(2, '0')}
                      </span>
                      <h3>{image.title}</h3>
                      <p>{image.description}</p>
                    </div>
                  </article>
                )
              )}
            </div>
          </div>

          <p className="gallery-hint">
            <span>←</span> Discover the possibilities of smart farming
            <span>→</span>
          </p>
        </section>

        {/* DASHBOARD HEADER */}
        <div className="section-title farmer-section-heading">
          <div>
            <span className="eyebrow">YOUR FARM OVERVIEW</span>
            <h2>{t.dashboard}</h2>
            <p className="muted">
              Everything you need to monitor your farm's health.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="card farmer-loading">
            <div className="loading-spinner" />
            <p className="muted">{t.loading}</p>
          </div>
        ) : (
          <>
            {/* STATISTICS */}
            <div className="grid grid-4 farmer-stats">
              <div className="card stat-card farmer-stat">
                <div className="stat-icon">🌾</div>
                <h3>{t.totalFarms}</h3>
                <div className="value">{farms.length}</div>
                <p className="stat-caption">Registered farms</p>
              </div>

              <div className="card stat-card farmer-stat">
                <div className="stat-icon">🔬</div>
                <h3>{t.latestDisease}</h3>
                <div className="value stat-value-small">
                  {latest?.disease || '—'}
                </div>
                <p className="stat-caption">
                  Latest detected disease
                </p>
              </div>

              <div className="card stat-card farmer-stat">
                <div className="stat-icon">🍃</div>
                <h3>{t.latestSeverity}</h3>
                <div className="value">
                  {latest ? `${latest.leafSeverity ?? 0}%` : '—'}
                </div>
                <p className="stat-caption">Leaf severity</p>
              </div>

              <div className="card stat-card farmer-stat">
                <div className="stat-icon">📊</div>
                <h3>Affected Area</h3>
                <div className="value">
                  {latest?.affectedAreaPercent != null
                    ? `${latest.affectedAreaPercent}%`
                    : '—'}
                </div>
                <p className="stat-caption">Latest analysis</p>
              </div>

              <div className="card stat-card farmer-stat">
                <div className="stat-icon">👨‍⚕️</div>
                <h3>{t.freeCallsRemaining}</h3>
                <div className="value">{remaining}/5</div>
                <p className="stat-caption">Consultation quota</p>
              </div>

              <div className="card stat-card farmer-stat action-stat">
                <div className="stat-icon">🩺</div>
                <h3>{t.doctorConsultation}</h3>
                <p className="stat-caption">
                  Get help from a leaf doctor.
                </p>
                <Link to="/doctors" className="btn stat-action-btn">
                  {t.consultDoctor} →
                </Link>
              </div>

              <div className="card stat-card farmer-stat action-stat">
                <div className="stat-icon">🤖</div>
                <h3>{t.aiAssistant}</h3>
                <p className="stat-caption">
                  Ask questions about crop care.
                </p>
                <Link to="/detect" className="btn stat-action-btn">
                  Analyse a Leaf →
                </Link>
              </div>

              <div className="card stat-card farmer-stat">
                <div className="stat-icon">✨</div>
                <h3>AI Analysis</h3>
                <div className="value stat-value-small">
                  {latest ? 'Available' : 'Not started'}
                </div>
                <p className="stat-caption">
                  {latest
                    ? 'Your latest result is available'
                    : 'Analyse a leaf to get started'}
                </p>
              </div>
            </div>

            {/* FARMS */}
            <section className="farmer-section">
              <div className="section-title">
                <div>
                  <span className="eyebrow">YOUR LAND</span>
                  <h2>{t.myFarms}</h2>
                </div>

                <Link to="/farms/new" className="btn btn-secondary">
                  + {t.addFarm}
                </Link>
              </div>

              {farms.length === 0 ? (
                <div className="card empty farmer-empty">
                  <div className="empty-illustration">🌱</div>
                  <h3>No farms added yet</h3>
                  <p>{t.emptyFarms}</p>
                  <Link to="/farms/new" className="btn">
                    {t.addFarm}
                  </Link>
                </div>
              ) : (
                <div className="grid grid-3 farmer-farms-grid">
                  {farms.map((farm, index) => (
                    <Link
                      key={farm.farmId}
                      to={`/farms/${farm.farmId}`}
                      className="card farmer-farm-card"
                      style={{ '--card-index': index }}
                    >
                      <div className="farm-card-image">
                        <img
                          src={farmImages[index % farmImages.length]}
                          alt={`${farm.farmName} farm`}
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src =
                              '/images/cotton-farm.jpg';
                          }}
                        />

                        <span className="farm-image-label">
                          🌿 {farm.crop || 'Farm'}
                        </span>
                      </div>

                      <div className="farm-card-body">
                        <div className="farm-card-title-row">
                          <h3>{farm.farmName}</h3>
                          <span className="farm-arrow">↗</span>
                        </div>

                        <p className="muted farm-location">
                          📍 {farm.locationLabel || 'Location not specified'}
                        </p>

                        <div className="farm-card-meta">
                          <span>
                            <strong>{farm.area ?? '—'}</strong>
                            <small>{farm.areaUnit || 'Area'}</small>
                          </span>

                          <span>
                            <strong>{farm.crop || '—'}</strong>
                            <small>Crop type</small>
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* LATEST RECOMMENDATION */}
            {rec && (
              <section className="farmer-recommendation">
                <div className="recommendation-symbol">✦</div>

                <div className="recommendation-content">
                  <span className="eyebrow">AI CROP-CARE TIP</span>
                  <h3>{t.latestRecommendation}</h3>
                  <p>{rec}</p>
                </div>
              </section>
            )}

            {/* FARMER RESOURCES, SCHEMES & MARKET PRICES */}
            <section className="farmer-tools-section">
              <div className="section-title">
                <div>
                  <span className="eyebrow">MORE FOR YOUR FARM</span>
                  <h2>Farmer Resources</h2>
                  <p className="muted">
                    Community support, government schemes and cotton
                    market information.
                  </p>
                </div>
              </div>

              <div className="farmer-tools-grid">
                {/* WHATSAPP COMMUNITY */}
                <article className="card farmer-tool-card whatsapp-tool">
                  <div className="farmer-tool-icon">💬</div>
                  <span className="farmer-tool-label">
                    FARMER COMMUNITY
                  </span>
                  <h3>Connect with Farmers</h3>
                  <p>
                    Join the CottonGuard farmer community to share
                    experiences and discuss crop-care tips.
                  </p>

                  <a
                    className="farmer-tool-button whatsapp-button"
                    href="https://chat.whatsapp.com/Bn306Tf0DFFBB53PrGZwv9"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Join WhatsApp Group ↗
                  </a>

                  <small className="farmer-tool-note">
                    Replace the link with your actual group invitation.
                  </small>
                </article>

                {/* GOVERNMENT SCHEMES */}
                <article className="card farmer-tool-card">
                  <div className="farmer-tool-icon">🏛️</div>
                  <span className="farmer-tool-label">
                    GOVERNMENT BENEFITS
                  </span>
                  <h3>Cotton Farmer Schemes</h3>
                  <p>
                    Explore government schemes and check eligibility,
                    benefits and application requirements.
                  </p>

                  <div className="farmer-resource-links">
                    <a
                      href="https://www.myscheme.gov.in/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Find eligible schemes ↗
                    </a>

                    <a
                      href="https://cotcorp.org.in/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Cotton Corporation of India ↗
                    </a>

                    <a
                      href="https://pmkisan.gov.in/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      PM-KISAN ↗
                    </a>
                  </div>

                  <small className="farmer-tool-note">
                    Check official websites for current eligibility
                    and deadlines.
                  </small>
                </article>

                {/* COTTON MARKET PRICES */}
                <article className="card farmer-tool-card market-tool">
                  <div className="farmer-tool-icon">📈</div>
                  <span className="farmer-tool-label">
                    COTTON MARKET
                  </span>
                  <h3>Nearby Mandi Prices</h3>
                  <p>
                    Find cotton prices for your district and nearby
                    agricultural markets.
                  </p>

                  <div className="market-location">
                    <span>📍 Your farm location</span>
                    <strong>
                      {farms[0]?.locationLabel ||
                        'Add your farm location'}
                    </strong>
                  </div>

                  <div className="market-data-status">
                    {marketLoading ? (
                      <p>Loading cotton market prices...</p>
                    ) : marketError ? (
                      <div>
                        <strong>Market prices unavailable</strong>
                        <p>{marketError}</p>

                        <button
                          type="button"
                          className="farmer-tool-button"
                          onClick={async () => {
                            try {
                              setMarketLoading(true);
                              setMarketError('');

                              const result = await mandiPricesApi.list({
                                state: 'Maharashtra',
                                commodity: 'Cotton',
                                limit: 5,
                              });

                              setMarketPrices(result.records || []);
                            } catch (err) {
                              setMarketError(
                                err.response?.data?.message ||
                                  err.message ||
                                  'Unable to load market prices.'
                              );
                            } finally {
                              setMarketLoading(false);
                            }
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    ) : marketPrices.length === 0 ? (
                      <div>
                        <strong>No market records found</strong>
                        <p>
                          Try searching for more markets and dates.
                        </p>
                      </div>
                    ) : (
                      <div className="market-price-list">
                        {marketPrices.map((item, index) => (
                          <div
                            className="market-price-item"
                            key={`${item.market || 'market'}-${item.arrivalDate || 'date'}-${index}`}
                          >
                            <div>
                              <strong>
                                {item.market || 'Market unavailable'}
                              </strong>

                              <p>
                                {[item.district, item.state]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>

                              <small>
                                Arrival date:{' '}
                                {item.arrivalDate || 'Not provided'}
                              </small>
                            </div>

                            <div>
                              <strong>
                                {item.modalPrice !== null &&
                                item.modalPrice !== undefined &&
                                item.modalPrice !== ''
                                  ? `₹${Number(
                                      item.modalPrice
                                    ).toLocaleString('en-IN')}`
                                  : '—'}
                              </strong>

                              <small>Modal price / quintal</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Link
                    to="/mandi-prices"
                    className="farmer-tool-button"
                  >
                    View all mandi prices →
                  </Link>

                  <a
                    className="farmer-tool-button"
                    href="https://agmarknet.gov.in/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Check AGMARKNET ↗
                  </a>
                </article>
              </div>
            </section>

            {/* START DETECTION BANNER */}
            {!latest && (
              <section className="farmer-detect-banner">
                <div>
                  <span className="eyebrow">START WITH A LEAF</span>
                  <h2>Let AI help you understand your crop.</h2>
                  <p>
                    Upload a leaf image to begin your disease analysis
                    and view the results.
                  </p>
                </div>

                <Link to="/detect" className="btn btn-lg">
                  Start Detection →
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
