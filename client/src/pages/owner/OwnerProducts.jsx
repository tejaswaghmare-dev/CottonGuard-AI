import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { productsApi } from '../../services/api';

const empty = {
  productName: '',
  manufacturer: '',
  activeIngredient: '',
  targetDisease: 'Bacterial Blight',
  crop: 'Cotton',
  usageInformation: '',
  price: '',
  stock: '',
};

export default function OwnerProducts() {
  const { t } = useLanguage();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await productsApi.list({ mine: 'true' });
    setProducts(d.products || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('image', file);
      if (editId) await productsApi.update(editId, fd);
      else await productsApi.create(fd);
      setForm(empty);
      setFile(null);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete product?')) return;
    await productsApi.remove(id);
    await load();
  }

  function startEdit(p) {
    setEditId(p.productId);
    setForm({
      productName: p.productName,
      manufacturer: p.manufacturer || '',
      activeIngredient: p.activeIngredient || '',
      targetDisease: p.targetDisease || '',
      crop: p.crop || 'Cotton',
      usageInformation: p.usageInformation || '',
      price: p.price,
      stock: p.stock,
    });
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.products}</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <form className="card" onSubmit={onSubmit} style={{ marginBottom: 16 }}>
          <h3>{editId ? t.edit : t.addProduct}</h3>
          <div className="grid grid-2">
            {['productName', 'manufacturer', 'activeIngredient', 'usageInformation'].map((k) => (
              <div className="form-group" key={k}>
                <label>{k}</label>
                <input required={k === 'productName'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div className="form-group">
              <label>targetDisease</label>
              <select value={form.targetDisease} onChange={(e) => setForm({ ...form, targetDisease: e.target.value })}>
                <option>Bacterial Blight</option>
                <option>Curl Virus</option>
                <option>Fusarium Wilt</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t.crop}</label>
              <input value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t.price}</label>
              <input type="number" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t.stock}</label>
              <input type="number" required value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Image</label>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0])} />
            </div>
          </div>
          <button className="btn" disabled={busy}>{busy ? t.loading : t.save}</button>
          {editId && (
            <button type="button" className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={() => { setEditId(null); setForm(empty); }}>
              {t.cancel}
            </button>
          )}
        </form>

        <div className="grid grid-2">
          {products.map((p) => (
            <div className="card" key={p.productId}>
              <h3>{p.productName}</h3>
              <p className="muted">{p.manufacturer} · {p.activeIngredient}</p>
              <p>₹{p.price} · Stock {p.stock} · {p.targetDisease}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => startEdit(p)}>{t.edit}</button>
                <button type="button" className="btn btn-danger" onClick={() => remove(p.productId)}>{t.delete}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
