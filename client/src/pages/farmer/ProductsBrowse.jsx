import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { productsApi } from '../../services/api';

export default function ProductsBrowse() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [disease, setDisease] = useState('');

  useEffect(() => {
    productsApi.list({ crop: 'Cotton', disease: disease || undefined }).then((d) => setProducts(d.products || []));
  }, [disease]);

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <h1>{t.products}</h1>
          <select value={disease} onChange={(e) => setDisease(e.target.value)}>
            <option value="">All diseases</option>
            <option>Bacterial Blight</option>
            <option>Curl Virus</option>
            <option>Fusarium Wilt</option>
          </select>
        </div>
        <p className="muted">Verified Firestore catalogue only — Gemini never invents products.</p>
        <div className="grid grid-2">
          {products.map((p) => (
            <div className="card product-card" key={p.productId}>
              {p.imageUrl ? <img src={p.imageUrl} alt="" /> : <div style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--cotton)' }} />}
              <div>
                <h3 style={{ margin: 0 }}>{p.productName}</h3>
                <p className="muted">{p.manufacturer} · {p.activeIngredient}</p>
                <p>Target: {Array.isArray(p.targetDisease) ? p.targetDisease.join(', ') : p.targetDisease}</p>
                <strong>₹{p.price}</strong> · {t.stock}: {p.stock}
                <p style={{ fontSize: '0.9rem' }}>{p.usageInformation}</p>
              </div>
            </div>
          ))}
        </div>
        {products.length === 0 && <div className="card empty">No products yet</div>}
      </div>
    </div>
  );
}
