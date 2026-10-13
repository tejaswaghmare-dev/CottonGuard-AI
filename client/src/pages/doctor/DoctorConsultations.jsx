
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { consultationsApi, doctorsApi } from '../../services/api';

export default function DoctorConsultations() {
  const { t } = useLanguage();

  const [list, setList] = useState([]);
  const [notes, setNotes] = useState({});
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState({});
  const [planEditors, setPlanEditors] = useState({});
  const [savingPlan, setSavingPlan] = useState({});
  const [loadingPlan, setLoadingPlan] = useState({});
  const [generatingPlan, setGeneratingPlan] = useState({});

  async function load() {
    const data = await consultationsApi.list();
    setList(data.consultations || []);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  function makeDays(count) {
    return Array.from({ length: count }, (_, index) => ({
      day: index + 1,
      title: `Day ${index + 1}`,
      tasks: [{ title: '', details: '' }],
    }));
  }

  async function openTreatmentPlan(consultation) {
    const id = consultation.consultationId;

    setLoadingPlan((prev) => ({ ...prev, [id]: true }));

    try {
      const result = await consultationsApi.getTreatmentPlan(id);
      const existing = result.treatmentPlan;

      setPlanEditors((prev) => ({
        ...prev,
        [id]: existing
          ? {
              ...existing,
              days: (existing.days || []).map((day, index) => ({
                ...day,
                day: day.day || index + 1,
                title: day.title || `Day ${index + 1}`,
                tasks: (day.tasks || []).map((task) => ({
                  taskId: task.taskId,
                  title: task.title || '',
                  details: task.details || '',
                })),
              })),
            }
          : {
              title: 'Cotton Treatment Plan',
              durationDays: 7,
              doctorInstructions: '',
              published: false,
              days: makeDays(7),
            },
      }));
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          error.message ||
          'Could not load treatment plan.'
      );
    } finally {
      setLoadingPlan((prev) => ({ ...prev, [id]: false }));
    }
  }

  function changePlan(id, field, value) {
    setPlanEditors((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  async function generateAiPlan(consultation) {
    const id = consultation.consultationId;
    const durationDays = Number(planEditors[id]?.durationDays || 7);

    setGeneratingPlan((prev) => ({ ...prev, [id]: true }));
    setMessage('');

    try {
      const result = await consultationsApi.generateTreatmentPlan(id, {
        durationDays,
        language: 'en',
      });

      if (!result.treatmentPlan) {
        throw new Error('The AI did not return a treatment plan.');
      }

      // The AI output is an editable draft, never automatically published.
      setPlanEditors((prev) => ({
        ...prev,
        [id]: {
          ...result.treatmentPlan,
          published: false,
          days: (result.treatmentPlan.days || []).map((day, index) => ({
            ...day,
            day: day.day || index + 1,
            title: day.title || `Day ${index + 1}`,
            tasks: (day.tasks || []).map((task) => ({
              title: task.title || '',
              details: task.details || '',
            })),
          })),
        },
      }));

      setMessage(
        result.treatmentPlan.source === 'fallback'
          ? 'A fallback draft was created. Review and edit it before publishing.'
          : 'AI draft generated successfully. Review and edit the plan before publishing.'
      );
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          error.message ||
          'Could not generate an AI treatment plan.'
      );
    } finally {
      setGeneratingPlan((prev) => ({ ...prev, [id]: false }));
    }
  }

  function changePlanDuration(id, durationDays) {
    setPlanEditors((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        durationDays,
        days: makeDays(durationDays),
      },
    }));
  }

  function changeDayTitle(id, dayIndex, value) {
    setPlanEditors((prev) => {
      const editor = prev[id];

      return {
        ...prev,
        [id]: {
          ...editor,
          days: editor.days.map((day, index) =>
            index === dayIndex ? { ...day, title: value } : day
          ),
        },
      };
    });
  }

  function changeDayTask(id, dayIndex, taskIndex, field, value) {
    setPlanEditors((prev) => {
      const editor = prev[id];

      return {
        ...prev,
        [id]: {
          ...editor,
          days: editor.days.map((day, index) =>
            index === dayIndex
              ? {
                  ...day,
                  tasks: day.tasks.map((task, currentIndex) =>
                    currentIndex === taskIndex
                      ? { ...task, [field]: value }
                      : task
                  ),
                }
              : day
          ),
        },
      };
    });
  }

  function addDayTask(id, dayIndex) {
    setPlanEditors((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        days: prev[id].days.map((day, index) =>
          index === dayIndex
            ? {
                ...day,
                tasks: [...day.tasks, { title: '', details: '' }],
              }
            : day
        ),
      },
    }));
  }

  async function publishTreatmentPlan(consultation, published) {
    const id = consultation.consultationId;
    const editor = planEditors[id];

    if (!editor) return;

    if (!editor.title?.trim()) {
      setMessage('Please enter a treatment plan title.');
      return;
    }

    if (
      ![7, 10].includes(Number(editor.durationDays)) ||
      !Array.isArray(editor.days) ||
      editor.days.length !== Number(editor.durationDays)
    ) {
      setMessage('The plan must contain exactly 7 or 10 days.');
      return;
    }

    const hasEmptyDay = editor.days.some(
      (day) => !day.tasks?.some((task) => task.title?.trim())
    );

    if (hasEmptyDay) {
      setMessage('Add at least one task to every day before saving.');
      return;
    }

    setSavingPlan((prev) => ({ ...prev, [id]: true }));
    setMessage('');

    try {
      await consultationsApi.saveTreatmentPlan(id, {
        ...editor,
        published,
        days: editor.days.map((day, index) => ({
          ...day,
          day: index + 1,
          tasks: day.tasks
            .filter((task) => task.title?.trim())
            .map((task) => ({
              ...(task.taskId ? { taskId: task.taskId } : {}),
              title: task.title.trim(),
              details: (task.details || '').trim(),
            })),
        })),
      });

      setMessage(
        published
          ? 'Treatment plan published for the farmer.'
          : 'Treatment plan saved as a draft.'
      );

      await openTreatmentPlan(consultation);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          error.message ||
          'Could not save treatment plan.'
      );
    } finally {
      setSavingPlan((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function updateStatus(id, status) {
    try {
      await consultationsApi.update(id, {
        status,
        doctorNotes: notes[id] || '',
      });

      setMessage(`Consultation status updated to ${status}.`);
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  }

  async function viewHistory(consultation) {
    try {
      const data = await doctorsApi.farmerHistory(
        consultation.farmerId,
        consultation.farmId
      );

      setHistory(data.predictions || []);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    }
  }

  // Existing PDF download functionality is preserved.
  async function downloadDoctorReport(consultation) {
    const id = consultation.consultationId;

    try {
      setDownloading((prev) => ({ ...prev, [id]: true }));

      const response = await consultationsApi.downloadDoctorReport(id);

      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: 'application/pdf' })
      );

      const link = document.createElement('a');
      link.href = url;
      link.download = `CottonGuard-Doctor-Report-${id}.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);

      setMessage('Doctor report PDF downloaded successfully.');
    } catch (error) {
      console.error('Doctor report download error:', error);

      let errorMessage = 'Failed to download doctor report.';

      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const data = JSON.parse(text);
          errorMessage = data.message || errorMessage;
        } catch {
          // Keep the default error message.
        }
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setMessage(errorMessage);
    } finally {
      setDownloading((prev) => ({ ...prev, [id]: false }));
    }
  }

  return (
    <div className="page">
      <div className="container">
        <h1>{t.consultations}</h1>

        {message && (
          <div className="alert alert-info" role="status">
            {message}
          </div>
        )}

        <div className="grid">
          {list.map((c) => {
            const id = c.consultationId;
            const editor = planEditors[id];
            const isPlanAvailable = ['accepted', 'completed'].includes(
              c.status
            );

            return (
              <div className="card" key={id}>
                {/* Consultation information */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <h3>
                      {c.date} · {c.time}
                    </h3>

                    <p className="muted">
                      Status: {c.status} · Farmer:{' '}
                      {c.farmerId ? `${c.farmerId.slice(0, 8)}…` : 'N/A'}
                    </p>

                    {c.meetingLink &&
                      ['confirmed', 'accepted', 'completed'].includes(
                        c.status
                      ) && (
                        <a
                          className="btn"
                          href={c.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t.joinMeet}
                        </a>
                      )}

                    <button
                      type="button"
                      className="btn"
                      style={{ marginLeft: 8, marginTop: 8 }}
                      onClick={() => downloadDoctorReport(c)}
                      disabled={Boolean(downloading[id])}
                    >
                      {downloading[id]
                        ? 'Generating PDF...'
                        : '📄 Download Disease Report'}
                    </button>
                  </div>

                  {/* Consultation actions */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      onClick={() => updateStatus(id, 'accepted')}
                    >
                      {t.accept}
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => updateStatus(id, 'rejected')}
                    >
                      {t.reject}
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => updateStatus(id, 'completed')}
                    >
                      Complete
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => viewHistory(c)}
                    >
                      {t.history}
                    </button>
                  </div>
                </div>

                {/* Doctor notes */}
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label htmlFor={`doctor-notes-${id}`}>{t.notes}</label>

                  <textarea
                    id={`doctor-notes-${id}`}
                    rows={3}
                    value={notes[id] ?? c.doctorNotes ?? ''}
                    onChange={(event) =>
                      setNotes((prev) => ({
                        ...prev,
                        [id]: event.target.value,
                      }))
                    }
                    placeholder="Enter consultation notes..."
                  />

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => updateStatus(id, c.status || 'accepted')}
                  >
                    Save notes
                  </button>
                </div>

                {/* AI and manual treatment plan */}
                {isPlanAvailable && (
                  <div
                    style={{
                      marginTop: 20,
                      paddingTop: 16,
                      borderTop: '1px solid #e5e7eb',
                    }}
                  >
                    <h3>🌱 Farmer Treatment Schedule</h3>

                    <p className="muted">
                      Generate an AI draft, review and edit it, or create a
                      plan manually. The farmer sees the plan only after you
                      publish it.
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        gap: 10,
                        flexWrap: 'wrap',
                        marginTop: 12,
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={
                          Boolean(loadingPlan[id]) ||
                          Boolean(generatingPlan[id])
                        }
                        onClick={() => openTreatmentPlan(c)}
                      >
                        {loadingPlan[id]
                          ? 'Loading plan...'
                          : '✏️ Create / Edit Manually'}
                      </button>

                      <button
                        type="button"
                        className="btn"
                        disabled={
                          Boolean(generatingPlan[id]) ||
                          Boolean(savingPlan[id])
                        }
                        onClick={() => generateAiPlan(c)}
                      >
                        {generatingPlan[id]
                          ? '✨ Generating Plan...'
                          : '✨ Generate Plan with AI'}
                      </button>
                    </div>

                    {editor && (
                      <div style={{ marginTop: 16 }}>
                        {editor.source && (
                          <p className="muted">
                            Draft source:{' '}
                            {editor.source === 'gemini'
                              ? 'AI-generated'
                              : editor.source === 'fallback'
                                ? 'Fallback template'
                                : 'Existing plan'}
                            . Please review the medical advice before
                            publishing.
                          </p>
                        )}

                        <div className="form-group">
                          <label htmlFor={`plan-title-${id}`}>
                            Plan title
                          </label>
                          <input
                            id={`plan-title-${id}`}
                            value={editor.title || ''}
                            onChange={(event) =>
                              changePlan(id, 'title', event.target.value)
                            }
                            placeholder="Cotton leaf recovery plan"
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor={`plan-duration-${id}`}>
                            Treatment duration
                          </label>
                          <select
                            id={`plan-duration-${id}`}
                            value={editor.durationDays || 7}
                            onChange={(event) =>
                              changePlanDuration(
                                id,
                                Number(event.target.value)
                              )
                            }
                          >
                            <option value={7}>7 days</option>
                            <option value={10}>10 days</option>
                          </select>
                          <p className="muted">
                            Changing the duration resets the schedule days.
                            Generate a new plan or recreate the schedule
                            afterward.
                          </p>
                        </div>

                        <div className="form-group">
                          <label htmlFor={`plan-instructions-${id}`}>
                            Doctor instructions
                          </label>
                          <textarea
                            id={`plan-instructions-${id}`}
                            rows={3}
                            value={editor.doctorInstructions || ''}
                            onChange={(event) =>
                              changePlan(
                                id,
                                'doctorInstructions',
                                event.target.value
                              )
                            }
                            placeholder="Enter advice and precautions..."
                          />
                        </div>

                        {(editor.days || []).map((day, dayIndex) => (
                          <div
                            key={`${id}-day-${dayIndex}`}
                            style={{
                              border: '1px solid #e5e7eb',
                              borderRadius: 12,
                              padding: 14,
                              marginTop: 14,
                            }}
                          >
                            <h4>Day {day.day || dayIndex + 1}</h4>

                            <div className="form-group">
                              <label
                                htmlFor={`day-title-${id}-${dayIndex}`}
                              >
                                Day heading
                              </label>
                              <input
                                id={`day-title-${id}-${dayIndex}`}
                                value={day.title || ''}
                                onChange={(event) =>
                                  changeDayTitle(
                                    id,
                                    dayIndex,
                                    event.target.value
                                  )
                                }
                                placeholder={`Day ${dayIndex + 1} activities`}
                              />
                            </div>

                            {(day.tasks || []).map((task, taskIndex) => (
                              <div
                                key={
                                  task.taskId ||
                                  `${id}-${dayIndex}-task-${taskIndex}`
                                }
                                className="form-group"
                                style={{
                                  padding: 10,
                                  borderRadius: 8,
                                  background: 'rgba(128,128,128,0.06)',
                                  marginTop: 10,
                                }}
                              >
                                <label>
                                  Task {taskIndex + 1}
                                </label>

                                <input
                                  value={task.title || ''}
                                  onChange={(event) =>
                                    changeDayTask(
                                      id,
                                      dayIndex,
                                      taskIndex,
                                      'title',
                                      event.target.value
                                    )
                                  }
                                  placeholder="Task name"
                                />

                                <input
                                  style={{ marginTop: 8 }}
                                  value={task.details || ''}
                                  onChange={(event) =>
                                    changeDayTask(
                                      id,
                                      dayIndex,
                                      taskIndex,
                                      'details',
                                      event.target.value
                                    )
                                  }
                                  placeholder="Instructions or precautions (optional)"
                                />
                              </div>
                            ))}

                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ marginTop: 10 }}
                              onClick={() => addDayTask(id, dayIndex)}
                            >
                              + Add task
                            </button>
                          </div>
                        ))}

                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 10,
                            marginTop: 16,
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={
                              Boolean(savingPlan[id]) ||
                              Boolean(generatingPlan[id])
                            }
                            onClick={() => publishTreatmentPlan(c, false)}
                          >
                            {savingPlan[id] ? 'Saving...' : 'Save Draft'}
                          </button>

                          <button
                            type="button"
                            className="btn"
                            disabled={
                              Boolean(savingPlan[id]) ||
                              Boolean(generatingPlan[id])
                            }
                            onClick={() => publishTreatmentPlan(c, true)}
                          >
                            {savingPlan[id]
                              ? 'Saving...'
                              : 'Publish to Farmer'}
                          </button>
                        </div>

                        <p className="muted" style={{ marginTop: 10 }}>
                          Current plan status:{' '}
                          {editor.published ? 'Published' : 'Draft'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {list.length === 0 && (
          <div className="card">
            <p className="empty">No consultations found.</p>
          </div>
        )}

        {/* Shared farm disease history */}
        {history.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <h3>Shared farm disease history</h3>

            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Disease</th>
                    <th>Severity</th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((prediction, index) => (
                    <tr
                      key={
                        prediction.predictionId ||
                        `${prediction.createdAt}-${index}`
                      }
                    >
                      <td>{(prediction.createdAt || '').slice(0, 10)}</td>
                      <td>{prediction.disease || 'N/A'}</td>
                      <td>
                        {prediction.leafSeverity != null
                          ? `${prediction.leafSeverity}%`
                          : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
