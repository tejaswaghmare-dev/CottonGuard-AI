
import { useEffect, useState } from 'react';
import { consultationsApi, paymentApi } from '../../services/api';

const statusColors = {
  confirmed: '#15803d',
  accepted: '#15803d',
  completed: '#2563eb',
  rejected: '#dc2626',
  cancelled: '#64748b',
  awaiting_payment: '#b45309',
  pending: '#b45309',
};

export default function Consultations() {
  const [list, setList] = useState([]);
  const [plans, setPlans] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loadingPlan, setLoadingPlan] = useState({});
  const [busyTask, setBusyTask] = useState('');
  const [paying, setPaying] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await consultationsApi.list();
      setList(data.consultations || []);
    } catch (error) {
      setMessage(error.message || 'Could not load consultations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function pay(consultation) {
    if (!consultation.paymentId) return;
    setPaying(consultation.consultationId);
    setMessage('');

    try {
      await paymentApi.confirm(consultation.paymentId);
      setMessage('Payment confirmed.');
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPaying('');
    }
  }

  async function togglePlan(consultationId) {
    const opening = !expanded[consultationId];

    setExpanded((old) => ({ ...old, [consultationId]: opening }));
    if (!opening || plans[consultationId]) return;

    setLoadingPlan((old) => ({ ...old, [consultationId]: true }));
    try {
      const result = await consultationsApi.getTreatmentPlan(consultationId);
      setPlans((old) => ({
        ...old,
        [consultationId]: result.treatmentPlan || null,
      }));
    } catch (error) {
      setMessage(error.message || 'Could not load treatment plan.');
    } finally {
      setLoadingPlan((old) => ({ ...old, [consultationId]: false }));
    }
  }

  async function toggleTask(consultationId, task) {
    const plan = plans[consultationId];
    if (!plan) return;

    setBusyTask(task.taskId);
    setMessage('');

    try {
      const result = await consultationsApi.updateTreatmentTask(
        consultationId,
        task.taskId,
        !task.completed
      );
      setPlans((old) => ({
        ...old,
        [consultationId]: result.treatmentPlan,
      }));
    } catch (error) {
      setMessage(error.message || 'Could not update task.');
    } finally {
      setBusyTask('');
    }
  }

  function planProgress(plan) {
    const tasks = (plan?.days || []).flatMap((day) => day.tasks || []);
    const done = tasks.filter((task) => task.completed).length;
    return {
      done,
      total: tasks.length,
      percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  }

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 1100 }}>
        <div style={styles.heading}>
          <div>
            <p style={styles.eyebrow}>COTTONGUARD AI · FARMER PORTAL</p>
            <h1 style={{ margin: '4px 0 8px' }}>My Consultations</h1>
            <p className="muted" style={{ margin: 0 }}>
              Manage doctor appointments and follow your treatment plan.
            </p>
          </div>
          <div style={styles.count}>
            <strong style={{ fontSize: 25 }}>{list.length}</strong>
            <span style={{ fontSize: 12 }}>Consultations</span>
          </div>
        </div>

        {message && (
          <div className="alert alert-info" role="status">{message}</div>
        )}

        {loading ? (
          <div className="card">Loading your consultations…</div>
        ) : list.length === 0 ? (
          <div className="card" style={styles.empty}>
            <div style={{ fontSize: 38 }}>🩺</div>
            <h3>No consultations yet</h3>
            <p className="muted">Your doctor appointments will appear here.</p>
          </div>
        ) : (
          <div style={styles.list}>
            {list.map((c) => {
              const plan = plans[c.consultationId];
              const progress = planProgress(plan);
              const status = (c.status || 'pending').toLowerCase();

              return (
                <article className="card" key={c.consultationId} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={styles.dateIcon}>🗓️</div>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <h3 style={{ margin: '0 0 5px' }}>
                        {c.date} <span className="muted">·</span> {c.time}
                      </h3>
                      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                        {c.consultationType === 'video' ? 'Video consultation' : 'Doctor consultation'}
                        {c.isFree ? ' · Free consultation' : ''}
                      </p>
                    </div>
                    <span style={{
                      ...styles.status,
                      color: statusColors[status] || '#475569',
                      background: `${statusColors[status] || '#64748b'}15`,
                    }}>
                      {status.replaceAll('_', ' ')}
                    </span>
                  </div>

                  <div style={styles.details}>
                    <div>
                      <span style={styles.label}>Consultation fee</span>
                      <strong>{Number(c.fee) === 0 ? 'Free' : `₹${c.fee}`}</strong>
                    </div>
                    <div>
                      <span style={styles.label}>Payment</span>
                      <strong>{c.paymentStatus || '—'}</strong>
                    </div>
                  </div>

                  {c.notes && (
                    <div style={styles.note}>
                      <strong>Your note</strong>
                      <p style={{ margin: '5px 0 0' }}>{c.notes}</p>
                    </div>
                  )}

                  {c.doctorNotes && (
                    <div style={styles.doctorNote}>
                      <strong>Doctor’s advice</strong>
                      <p style={{ margin: '5px 0 0', whiteSpace: 'pre-wrap' }}>
                        {c.doctorNotes}
                      </p>
                    </div>
                  )}

                  <div style={styles.actions}>
                    {c.meetingLink &&
                      ['confirmed', 'accepted', 'completed'].includes(status) && (
                        <a
                          className="btn"
                          href={c.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Join Google Meet
                        </a>
                      )}

                    {c.paymentStatus === 'pending' && c.paymentId && (
                      <button
                        className="btn"
                        type="button"
                        disabled={paying === c.consultationId}
                        onClick={() => pay(c)}
                      >
                        {paying === c.consultationId ? 'Processing…' : 'Complete payment'}
                      </button>
                    )}

                    {['accepted', 'completed'].includes(status) && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => togglePlan(c.consultationId)}
                      >
                        {expanded[c.consultationId] ? 'Hide treatment plan' : '🌱 View treatment plan'}
                      </button>
                    )}
                  </div>

                  {expanded[c.consultationId] && (
                    <section style={styles.plan}>
                      {loadingPlan[c.consultationId] ? (
                        <p>Loading treatment plan…</p>
                      ) : !plan ? (
                        <div style={styles.emptyPlan}>
                          <strong>Your doctor hasn’t published a treatment plan yet.</strong>
                          <p className="muted" style={{ marginBottom: 0 }}>
                            Check back after your consultation.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div style={styles.planHeader}>
                            <div>
                              <p style={styles.eyebrow}>YOUR CARE CHECKLIST</p>
                              <h3 style={{ margin: '4px 0' }}>{plan.title}</h3>
                              <p className="muted" style={{ margin: 0 }}>
                                {plan.durationDays}-day plan
                              </p>
                            </div>
                            <strong>{progress.percent}%</strong>
                          </div>

                          <div style={styles.progressTrack}>
                            <div style={{
                              ...styles.progressFill,
                              width: `${progress.percent}%`,
                            }} />
                          </div>
                          <p className="muted" style={{ fontSize: 12 }}>
                            {progress.done} of {progress.total} tasks completed
                          </p>

                          {plan.doctorInstructions && (
                            <div style={styles.doctorNote}>
                              <strong>Doctor’s instructions</strong>
                              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                                {plan.doctorInstructions}
                              </p>
                            </div>
                          )}

                          {(plan.days || []).map((day) => (
                            <div key={day.day} style={styles.day}>
                              <h4 style={{ margin: '0 0 10px' }}>
                                Day {day.day}{day.title && day.title !== `Day ${day.day}` ? ` · ${day.title}` : ''}
                              </h4>

                              {day.tasks?.length ? day.tasks.map((task) => (
                                <label key={task.taskId} style={styles.task}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(task.completed)}
                                    disabled={busyTask === task.taskId}
                                    onChange={() => toggleTask(c.consultationId, task)}
                                  />
                                  <span style={{ flex: 1 }}>
                                    <strong style={{
                                      textDecoration: task.completed ? 'line-through' : 'none',
                                      opacity: task.completed ? 0.65 : 1,
                                    }}>
                                      {task.title}
                                    </strong>
                                    {task.details && (
                                      <span style={styles.taskDetails}>{task.details}</span>
                                    )}
                                  </span>
                                </label>
                              )) : (
                                <p className="muted">No tasks added for this day.</p>
                              )}
                            </div>
                          ))}
                          <p className="muted" style={{ fontSize: 12 }}>
                            Follow the instructions provided by your doctor. Ask your doctor before changing any treatment.
                          </p>
                        </>
                      )}
                    </section>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  heading: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 16, flexWrap: 'wrap', marginBottom: 24,
  },
  eyebrow: {
    fontSize: 11, letterSpacing: 1.3, fontWeight: 800, color: '#56823c',
    margin: 0,
  },
  count: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '12px 20px', borderRadius: 14, background: '#edf7e9',
    color: '#2f6330', minWidth: 100,
  },
  list: { display: 'grid', gap: 18 },
  card: { padding: 20, minWidth: 0 },
  cardTop: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  dateIcon: {
    display: 'grid', placeItems: 'center', width: 48, height: 48,
    borderRadius: 13, background: '#f0f7eb', fontSize: 22,
  },
  status: {
    borderRadius: 999, padding: '6px 10px', fontSize: 12,
    fontWeight: 700, textTransform: 'capitalize',
  },
  details: {
    display: 'flex', flexWrap: 'wrap', gap: 28, margin: '18px 0',
    padding: '14px 0', borderTop: '1px solid #e5e7eb',
    borderBottom: '1px solid #e5e7eb',
  },
  label: { display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  note: {
    padding: 12, borderRadius: 10, background: '#f8fafc',
    marginTop: 12, overflowWrap: 'anywhere',
  },
  doctorNote: {
    padding: 12, borderRadius: 10, background: '#f0f7eb',
    marginTop: 12, overflowWrap: 'anywhere',
  },
  plan: {
    marginTop: 20, paddingTop: 18, borderTop: '1px solid #e5e7eb',
  },
  planHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  },
  progressTrack: {
    height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: {
    height: '100%', background: '#4d8b38', borderRadius: 999,
    transition: 'width 200ms ease',
  },
  day: {
    border: '1px solid #e5e7eb', borderRadius: 12,
    padding: 14, marginTop: 12,
  },
  task: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 0', borderTop: '1px solid #f1f5f9',
    cursor: 'pointer',
  },
  taskDetails: {
    display: 'block', fontSize: 13, color: '#64748b',
    marginTop: 4, whiteSpace: 'pre-wrap',
  },
  empty: { textAlign: 'center', padding: 36 },
  emptyPlan: {
    padding: 16, borderRadius: 10, background: '#f8fafc',
  },
};
