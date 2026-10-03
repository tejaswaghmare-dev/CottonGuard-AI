import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { consultationsApi, paymentApi } from '../../services/api';

export default function Consultations() {
  const { t } = useLanguage();
  const [list, setList] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    const d = await consultationsApi.list();
    setList(d.consultations || []);
  }

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  async function pay(c) {
    if (!c.paymentId) return;
    try {
      await paymentApi.confirm(c.paymentId);
      setMessage('Payment confirmed');
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.consultations}</h1>
        {message && <div className="alert alert-info">{message}</div>}
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Status</th>
                <th>Fee</th>
                <th>Meet</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.consultationId}>
                  <td>{c.date}</td>
                  <td>{c.time}</td>
                  <td>
                    <span className="badge">{c.status}</span>
                    {c.isFree && ' · Free'}
                  </td>
                  <td>₹{c.fee}</td>
                  <td>
                    {c.meetingLink && ['confirmed', 'accepted', 'completed'].includes(c.status) ? (
                      <a className="btn" href={c.meetingLink} target="_blank" rel="noreferrer">{t.joinMeet}</a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {c.paymentStatus === 'pending' && c.paymentId && (
                      <button className="btn btn-secondary" type="button" onClick={() => pay(c)}>{t.demoPay}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="empty">No consultations yet</p>}
        </div>
      </div>
    </div>
  );
}
