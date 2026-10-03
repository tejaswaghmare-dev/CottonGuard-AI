const { v4: uuidv4 } = require('uuid');
const { env } = require('../config/env');
const { getDb } = require('../config/firebase');

/**
 * Mock payment gateway — structured for Razorpay swap later.
 */
async function createPaymentOrder({ farmerId, amount, purpose, consultationId, metadata }) {
  const db = getDb();
  const paymentId = uuidv4();
  const now = new Date().toISOString();

  if (env.paymentMode === 'razorpay' && env.razorpay.keyId && env.razorpay.keySecret) {
    // Integration point for Razorpay Orders API
    // const Razorpay = require('razorpay');
    // const rzp = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
    // const order = await rzp.orders.create({ amount: amount * 100, currency: 'INR', ... });
    throw Object.assign(
      new Error('Razorpay mode selected but SDK not wired yet. Use PAYMENT_MODE=mock.'),
      { status: 501 }
    );
  }

  const order = {
    paymentId,
    farmerId,
    amount: Number(amount),
    currency: 'INR',
    purpose: purpose || 'consultation',
    consultationId: consultationId || null,
    status: 'created',
    mode: 'mock',
    mockCheckoutToken: `mock_${paymentId}`,
    metadata: metadata || {},
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('payments').doc(paymentId).set(order);
  return order;
}

async function confirmMockPayment(paymentId, farmerId) {
  const db = getDb();
  const ref = db.collection('payments').doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Payment not found'), { status: 404 });
  const payment = snap.data();
  if (payment.farmerId !== farmerId) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  if (payment.status === 'paid') return payment;

  const updates = {
    status: 'paid',
    paidAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    gatewayResponse: { mock: true, message: 'Demo payment successful' },
  };
  await ref.update(updates);

  if (payment.consultationId) {
    await db.collection('consultations').doc(payment.consultationId).update({
      paymentStatus: 'paid',
      status: 'confirmed',
      updatedAt: new Date().toISOString(),
    });
  }

  return { ...payment, ...updates };
}

module.exports = { createPaymentOrder, confirmMockPayment };
