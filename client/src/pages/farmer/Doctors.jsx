import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { doctorsApi, consultationsApi, farmsApi, paymentApi } from '../../services/api';

export default function Doctors() {
  const { t } = useLanguage();
  const { quota, refreshProfile } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [farms, setFarms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ farmId: '', date: '', time: '' });
  const [message, setMessage] = useState('');
  const [payment, setPayment] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    doctorsApi.list().then((d) => setDoctors(d.doctors || []));
    farmsApi.list().then((d) => setFarms(d.farms || []));
    refreshProfile();
  }, []);

  async function book(doctor) {
    if (!form.date || !form.time) {
      setMessage('Select date and time');
      return;
    }
    setBusy(true);
    setMessage('');
    setPayment(null);
    try {
      const res = await consultationsApi.book({
        doctorId: doctor.doctorId,
        farmId: form.farmId || undefined,
        date: form.date,
        time: form.time,
        consultationType: 'video',
      });
      await refreshProfile();
      if (res.payment) {
        setPayment(res.payment);
        setMessage(res.quotaMessage || t.freeLimitReached);
      } else {
        setMessage(`Booked! Status: ${res.consultation.status}. Meeting link available in My Consultations.`);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function payDemo() {
    if (!payment?.paymentId) return;
    setBusy(true);
    try {
      await paymentApi.confirm(payment.paymentId);
      setMessage('Demo payment successful. Consultation confirmed — check My Consultations for Google Meet link.');
      setPayment(null);
      await refreshProfile();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <div>
            <h1>{t.nav.doctors}</h1>
            <p className="muted">{t.freeCallsRemaining}: {quota?.remaining ?? '—'}/5</p>
          </div>
          <Link className="btn btn-secondary" to="/consultations">{t.consultations}</Link>
        </div>

        {message && <div className={`alert ${payment ? 'alert-warn' : 'alert-info'}`}>{message}</div>}
        {payment && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>{t.paidConsultation}</h3>
            <p>Amount: ₹{payment.amount}</p>
            <button className="btn" disabled={busy} onClick={payDemo}>{t.demoPay}</button>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid grid-3">
            <div className="form-group">
              <label>Farm (optional)</label>
              <select value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value })}>
                <option value="">—</option>
                {farms.map((f) => <option key={f.farmId} value={f.farmId}>{f.farmName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          {doctors.map((d) => (
            <div className="card" key={d.doctorId}>
              <h3>{d.displayName}</h3>
              <p className="muted">{d.expertise} · {d.location}</p>
              <p>Fee: ₹{d.consultationFee} (after free quota)</p>
              {d.availableSlots?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong>{t.availableSlots}</strong>
                  <ul>
                    {d.availableSlots.slice(0, 5).map((s, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => setForm({ ...form, date: s.date, time: s.time })}
                        >
                          {s.date} {s.time}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button className="btn" disabled={busy} onClick={() => { setSelected(d); book(d); }}>
                {t.bookConsultation}
              </button>
            </div>
          ))}
          {doctors.length === 0 && (
            <div className="card empty">No Leaf Doctors registered yet. Ask a doctor to create an account with role Leaf Doctor.</div>
          )}
        </div>
      </div>
    </div>
  );
}
