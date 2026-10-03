import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { productsApi } from '../../services/api';

export default function OwnerDashboard() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    productsApi.list({ mine: 'true' }).then((d) => setProducts(d.products || []));
  }, []);

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <div>
            <h1>{t.dashboard}</h1>
            <p className="muted">{profile?.displayName} · {t.pesticideOwner}</p>
          </div>
          <Link className="btn" to="/owner/products">{t.addProduct}</Link>
        </div>
        <div className="grid grid-3">
          <div className="card stat-card">
            <h3>{t.products}</h3>
            <div className="value">{products.length}</div>
          </div>
          <div className="card stat-card">
            <h3>{t.stock}</h3>
            <div className="value">{products.reduce((s, p) => s + (p.stock || 0), 0)}</div>
          </div>
        </div>
        <div className="alert alert-info" style={{ marginTop: 16 }}>
          You manage your catalogue only. You cannot alter AI prediction results.
        </div>
      </div>
    </div>
  );
}
