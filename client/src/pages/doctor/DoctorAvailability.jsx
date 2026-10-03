import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { doctorsApi } from '../../services/api';

export default function DoctorAvailability() {
  const { t } = useLanguage();
  const [slots, setSlots] = useState([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    doctorsApi.list().then(() => {});
    // load own profile via doctors list filtered client-side isn't ideal; use update response
  }, []);

  function addSlot() {
    if (!date || !time) return;
    setSlots((s) => [...s, { date, time }]);
    setDate('');
    setTime('');
  }

  async function save() {
    try {
      await doctorsApi.setAvailability(slots);
      setMessage('Availability saved');
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.availableSlots}</h1>
        {message && <div className="alert alert-info">{message}</div>}
        <div className="card">
          <div className="grid grid-3">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label>&nbsp;</label>
              <button type="button" className="btn btn-secondary" onClick={addSlot}>Add slot</button>
            </div>
          </div>
          <ul>
            {slots.map((s, i) => (
              <li key={i}>
                {s.date} {s.time}{' '}
                <button type="button" className="ghost-btn" onClick={() => setSlots(slots.filter((_, idx) => idx !== i))}>
                  {t.delete}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn" onClick={save}>{t.save}</button>
        </div>
      </div>
    </div>
  );
}
