
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import {
  doctorsApi,
  consultationsApi,
  farmsApi,
  paymentApi,
} from '../../services/api';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const scriptUrl =
      'https://checkout.razorpay.com/v1/checkout.js';

    const existingScript = document.querySelector(
      `script[src="${scriptUrl}"]`
    );

    if (existingScript) {
      existingScript.addEventListener(
        'load',
        () => resolve(true),
        { once: true }
      );

      existingScript.addEventListener(
        'error',
        () => resolve(false),
        { once: true }
      );

      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);

    document.body.appendChild(script);
  });
}

export default function Doctors() {
  const { t } = useLanguage();
  const { quota, refreshProfile } = useAuth();

  const refreshProfileRef = useRef(refreshProfile);

  const [doctors, setDoctors] = useState([]);
  const [farms, setFarms] = useState([]);

  const [form, setForm] = useState({
    farmId: '',
    date: '',
    time: '',
  });

  const [message, setMessage] = useState('');
  const [payment, setPayment] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshProfileRef.current = refreshProfile;
  }, [refreshProfile]);

  const loadPaymentHistory = useCallback(async () => {
    try {
      const result = await paymentApi.history();
      setPaymentHistory(result.payments || []);
    } catch (err) {
      console.error('Unable to load payment history:', err);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPage() {
      try {
        const [doctorResult, farmResult] = await Promise.all([
          doctorsApi.list(),
          farmsApi.list(),
        ]);

        if (active) {
          setDoctors(doctorResult.doctors || []);
          setFarms(farmResult.farms || []);
        }
      } catch (err) {
        if (active) {
          setMessage(
            err.message || 'Unable to load doctors and farms.'
          );
        }
      }

      try {
        await refreshProfileRef.current();
      } catch (err) {
        console.error('Unable to refresh farmer profile:', err);
      }

      if (active) {
        await loadPaymentHistory();
      }
    }

    loadPage();

    return () => {
      active = false;
    };
  }, [loadPaymentHistory]);

  async function book(doctor) {
    if (!form.date || !form.time) {
      setMessage('Please select a consultation date and time.');
      return;
    }

    if (busy) return;

    setBusy(true);
    setMessage('');
    setPayment(null);

    try {
      const result = await consultationsApi.book({
        doctorId: doctor.doctorId,
        farmId: form.farmId || undefined,
        date: form.date,
        time: form.time,
        consultationType: 'video',
      });

      await refreshProfileRef.current();

      if (result.payment) {
        setPayment(result.payment);

        setMessage(
          result.quotaMessage ||
            'Payment is required to confirm this consultation. Complete checkout to continue.'
        );
      } else {
        setMessage(
          `Consultation booked! Status: ${
            result.consultation?.status || 'confirmed'
          }. Check My Consultations for meeting details.`
        );
      }

      await loadPaymentHistory();
    } catch (err) {
      setMessage(err.message || 'Unable to book consultation.');
    } finally {
      setBusy(false);
    }
  }

  async function payDemo() {
    if (!payment?.paymentId || busy) return;

    setBusy(true);
    setMessage('');

    try {
      if (payment.mode === 'razorpay_test') {
        if (!payment.keyId || !payment.gatewayOrderId) {
          throw new Error(
            'Payment order details are missing. Please book again or refresh the payment details.'
          );
        }

        const loaded = await loadRazorpayScript();

        if (!loaded || !window.Razorpay) {
          throw new Error(
            'Unable to load Razorpay Checkout. Check your internet connection.'
          );
        }

        const options = {
          key: payment.keyId,
          amount: payment.amountPaise,
          currency: payment.currency || 'INR',
          name: 'CottonGuard AI',
          description: 'Leaf Doctor Consultation',
          order_id: payment.gatewayOrderId,

          theme: {
            color: '#84cc16',
          },

          handler: async (response) => {
            try {
              const result = await paymentApi.confirm({
                paymentId: payment.paymentId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });

              if (
                result.success === false ||
                result.payment?.status === 'failed'
              ) {
                throw new Error(
                  result.message || 'Payment verification failed.'
                );
              }

              const confirmedPayment = result.payment;

              if (
                confirmedPayment?.status &&
                confirmedPayment.status !== 'paid'
              ) {
                throw new Error(
                  'The payment has not been marked as paid. Please check your payment history before retrying.'
                );
              }

              setPayment(null);

              setMessage(
                `Payment verification completed. Receipt: ${
                  confirmedPayment?.receiptId || 'Check payment history'
                }. Check My Consultations for booking details.`
              );

              await refreshProfileRef.current();
              await loadPaymentHistory();
            } catch (err) {
              setMessage(
                err.message ||
                  'Unable to verify the payment. Check payment history before retrying.'
              );

              await loadPaymentHistory();
            } finally {
              setBusy(false);
            }
          },

          modal: {
            ondismiss: () => {
              setBusy(false);
              setMessage(
                'Checkout closed. Check payment history before retrying; your consultation may still be pending.'
              );
            },
          },
        };

        const checkout = new window.Razorpay(options);

        checkout.on('payment.failed', (response) => {
          setBusy(false);

          setMessage(
            response.error?.description ||
              'Test payment failed. Please try again.'
          );

          loadPaymentHistory();
        });

        checkout.open();
        return;
      }

      // Local mock mode: development only, not a Razorpay transaction.
      const result = await paymentApi.confirm(payment.paymentId);

      setPayment(null);

      setMessage(
        `Demo payment processed. Receipt: ${
          result.payment?.receiptId || 'Check payment history'
        }. This is not a Razorpay transaction.`
      );

      await refreshProfileRef.current();
      await loadPaymentHistory();
    } catch (err) {
      setMessage(err.message || 'Unable to start payment.');
      setBusy(false);
    }
  }

  const today = new Date();
  const minDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  return (
    <div className="page">
      <div className="container">
        <div className="section-title">
          <div>
            <h1>{t.nav.doctors}</h1>
            <p className="muted">
              {t.freeCallsRemaining}:{' '}
              {quota?.remaining ?? '—'}/5 free consultations remaining
            </p>
          </div>

          <Link className="btn btn-secondary" to="/consultations">
            {t.consultations}
          </Link>
        </div>

        {message && (
          <div
            className={`alert ${
              payment ? 'alert-warn' : 'alert-info'
            }`}
            role="status"
          >
            {message}
          </div>
        )}

        {payment && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>💳 Secure Consultation Payment</h3>

            <p>
              <strong>Amount:</strong>{' '}
              ₹{Number(payment.amount || 0).toLocaleString('en-IN')}
            </p>

            <p>
              <strong>Payment mode:</strong>{' '}
              {payment.mode === 'razorpay_test'
                ? 'Razorpay Test Mode'
                : 'Local Demo Mode'}
            </p>

            <p className="muted">
              {payment.mode === 'razorpay_test'
                ? 'Test checkout only. Use Razorpay test credentials; no real payment should be made.'
                : 'Development demo payment. No real money is transferred.'}
            </p>

            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={payDemo}
            >
              {busy
                ? 'Processing...'
                : payment.mode === 'razorpay_test'
                  ? 'Pay Securely · Test Mode'
                  : 'Confirm Demo Payment'}
            </button>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Book a Leaf Doctor</h3>

          <div className="grid grid-3">
            <div className="form-group">
              <label htmlFor="farmId">Farm (optional)</label>

              <select
                id="farmId"
                value={form.farmId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    farmId: event.target.value,
                  })
                }
              >
                <option value="">Select farm</option>

                {farms.map((farm) => (
                  <option key={farm.farmId} value={farm.farmId}>
                    {farm.farmName}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="consultationDate">Date</label>

              <input
                id="consultationDate"
                type="date"
                min={minDate}
                value={form.date}
                onChange={(event) =>
                  setForm({
                    ...form,
                    date: event.target.value,
                  })
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="consultationTime">Time</label>

              <input
                id="consultationTime"
                type="time"
                value={form.time}
                onChange={(event) =>
                  setForm({
                    ...form,
                    time: event.target.value,
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          {doctors.map((doctor) => (
            <div className="card" key={doctor.doctorId}>
              <h3>{doctor.displayName}</h3>

              <p className="muted">
                {doctor.expertise} · {doctor.location}
              </p>

              <p>
                Consultation fee: ₹
                {Number(
                  doctor.consultationFee || 299
                ).toLocaleString('en-IN')}{' '}
                <span className="muted">(after free quota)</span>
              </p>

              {doctor.availableSlots?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <strong>{t.availableSlots}</strong>

                  <ul>
                    {doctor.availableSlots.slice(0, 5).map((slot, index) => (
                      <li key={`${slot.date}-${slot.time}-${index}`}>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() =>
                            setForm({
                              ...form,
                              date: slot.date,
                              time: slot.time,
                            })
                          }
                        >
                          {slot.date} {slot.time}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => book(doctor)}
              >
                {busy ? 'Please wait...' : t.bookConsultation}
              </button>
            </div>
          ))}

          {doctors.length === 0 && (
            <div className="card empty">
              No Leaf Doctors registered yet. Ask a doctor to create an
              account with the Leaf Doctor role.
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 24 }}>
          <div className="section-title">
            <div>
              <h3>Payment History &amp; Receipts</h3>
              <p className="muted">
                View your consultation payment records and receipts.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={loadPaymentHistory}
            >
              Refresh
            </button>
          </div>

          {paymentHistory.length === 0 ? (
            <p className="muted">No payment records found yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Receipt ID</th>
                    <th>Amount</th>
                    <th>Payment Mode</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  {paymentHistory.map((item) => (
                    <tr key={item.paymentId}>
                      <td>{item.receiptId || 'Pending'}</td>

                      <td>
                        ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                      </td>

                      <td>
                        {item.mode === 'razorpay_test'
                          ? 'Razorpay Test'
                          : 'Demo'}
                      </td>

                      <td>{item.status || 'Unknown'}</td>

                      <td>
                        {item.paidAt
                          ? new Date(item.paidAt).toLocaleString()
                          : item.createdAt
                            ? new Date(item.createdAt).toLocaleString()
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
