import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { consultationsApi, doctorsApi } from '../../services/api';

export default function DoctorConsultations() {
  const { t } = useLanguage();
  const [list, setList] = useState([]);
  const [notes, setNotes] = useState({});
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    const d = await consultationsApi.list();
    setList(d.consultations || []);
  }

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  async function updateStatus(id, status) {
    try {
      await consultationsApi.update(id, { status, doctorNotes: notes[id] || '' });
      setMessage(`Updated to ${status}`);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function viewHistory(c) {
    try {
      const d = await doctorsApi.farmerHistory(c.farmerId, c.farmId);
      setHistory(d.predictions || []);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.consultations}</h1>
        {message && <div className="alert alert-info">{message}</div>}
        <div className="grid">
          {list.map((c) => (
            <div className="card" key={c.consultationId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h3>{c.date} · {c.time}</h3>
                  <p className="muted">Status: {c.status} · Farmer: {c.farmerId.slice(0, 8)}…</p>
                  {c.meetingLink && ['confirmed', 'accepted', 'completed'].includes(c.status) && (
                    <a className="btn" href={c.meetingLink} target="_blank" rel="noreferrer">{t.joinMeet}</a>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={() => updateStatus(c.consultationId, 'accepted')}>{t.accept}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => updateStatus(c.consultationId, 'rejected')}>{t.reject}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => updateStatus(c.consultationId, 'completed')}>Complete</button>
                  <button type="button" className="btn btn-secondary" onClick={() => viewHistory(c)}>{t.history}</button>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label>{t.notes}</label>
                <textarea
                  rows={2}
                  value={notes[c.consultationId] || c.doctorNotes || ''}
                  onChange={(e) => setNotes({ ...notes, [c.consultationId]: e.target.value })}
                />
                <button type="button" className="btn btn-secondary" onClick={() => updateStatus(c.consultationId, c.status || 'accepted')}>
                  Save notes
                </button>
              </div>
            </div>
          ))}
        </div>
        {history.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Shared farm disease history</h3>
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Disease</th><th>Severity</th></tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.predictionId}>
                    <td>{(p.createdAt || '').slice(0, 10)}</td>
                    <td>{p.disease}</td>
                    <td>{p.leafSeverity}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
