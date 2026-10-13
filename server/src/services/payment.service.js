
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { env } = require('../config/env');
const { getDb } = require('../config/firebase');

function getRazorpayClient() {
  const { keyId, keySecret } = env.razorpay;

  if (!keyId || !keySecret) {
    throw Object.assign(
      new Error('Razorpay Test Mode keys are missing from server .env'),
      { status: 500 }
    );
  }

  // This demo must never create live Razorpay orders.
  if (!keyId.startsWith('rzp_test_')) {
    throw Object.assign(
      new Error('Only Razorpay Test Mode keys are allowed for this demo.'),
      { status: 400 }
    );
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

async function createPaymentOrder({
  farmerId,
  amount,
  purpose,
  consultationId,
  metadata,
}) {
  const db = getDb();
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw Object.assign(new Error('Invalid payment amount'), {
      status: 400,
    });
  }

  const paymentId = uuidv4();
  const now = new Date().toISOString();

  if (env.paymentMode === 'razorpay') {
    const razorpay = getRazorpayClient();
    const amountPaise = Math.round(numericAmount * 100);

    const gatewayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: paymentId.slice(0, 40),
      notes: {
        farmerId,
        consultationId: consultationId || '',
        purpose: purpose || 'consultation',
      },
    });

    const payment = {
      paymentId,
      farmerId,
      amount: numericAmount,
      amountPaise,
      currency: 'INR',
      purpose: purpose || 'consultation',
      consultationId: consultationId || null,
      status: 'created',
      mode: 'razorpay_test',
      keyId: env.razorpay.keyId,
      gatewayOrderId: gatewayOrder.id,
      metadata: metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('payments').doc(paymentId).set(payment);
    return payment;
  }

  // Local mock mode remains available for development.
  const payment = {
    paymentId,
    farmerId,
    amount: numericAmount,
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

  await db.collection('payments').doc(paymentId).set(payment);
  return payment;
}

async function confirmRazorpayPayment(
  {
    paymentId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  },
  farmerId
) {
  if (
    !paymentId ||
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature
  ) {
    throw Object.assign(
      new Error('Payment verification details are incomplete'),
      { status: 400 }
    );
  }

  const db = getDb();
  const ref = db.collection('payments').doc(paymentId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw Object.assign(new Error('Payment not found'), { status: 404 });
  }

  const payment = snap.data();

  if (payment.farmerId !== farmerId) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }

  if (payment.mode !== 'razorpay_test') {
    throw Object.assign(new Error('This is not a Razorpay test order'), {
      status: 400,
    });
  }

  if (payment.gatewayOrderId !== razorpay_order_id) {
    throw Object.assign(new Error('Razorpay order ID mismatch'), {
      status: 400,
    });
  }

  const { keySecret } = env.razorpay;

  if (!keySecret || !env.razorpay.keyId?.startsWith('rzp_test_')) {
    throw Object.assign(new Error('Razorpay Test Mode is not configured'), {
      status: 500,
    });
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const receivedBuffer = Buffer.from(razorpay_signature, 'hex');

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw Object.assign(new Error('Payment signature verification failed'), {
      status: 400,
    });
  }

  if (payment.status === 'paid') {
    if (payment.gatewayPaymentId !== razorpay_payment_id) {
      throw Object.assign(new Error('Payment ID mismatch'), { status: 400 });
    }
    return payment;
  }

  const now = new Date().toISOString();
  const receiptId = `CG-${paymentId.slice(0, 8).toUpperCase()}`;

  const updates = {
    status: 'paid',
    gatewayPaymentId: razorpay_payment_id,
    receiptId,
    paidAt: now,
    updatedAt: now,
    gatewayResponse: {
      verified: true,
      mode: 'razorpay_test',
    },
  };

  const batch = db.batch();
  batch.update(ref, updates);

  if (payment.consultationId) {
    const consultationRef = db
      .collection('consultations')
      .doc(payment.consultationId);

    batch.update(consultationRef, {
      paymentStatus: 'paid',
      status: 'confirmed',
      updatedAt: now,
    });
  }

  await batch.commit();

  return { ...payment, ...updates };
}

async function confirmMockPayment(paymentId, farmerId) {
  if (env.paymentMode === 'razorpay') {
    throw Object.assign(
      new Error('Mock confirmation is disabled in Razorpay mode'),
      { status: 400 }
    );
  }

  const db = getDb();
  const ref = db.collection('payments').doc(paymentId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw Object.assign(new Error('Payment not found'), { status: 404 });
  }

  const payment = snap.data();

  if (payment.farmerId !== farmerId) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }

  if (payment.status === 'paid') return payment;

  const now = new Date().toISOString();
  const updates = {
    status: 'paid',
    receiptId: `CG-${paymentId.slice(0, 8).toUpperCase()}`,
    paidAt: now,
    updatedAt: now,
    gatewayResponse: {
      mock: true,
      message: 'Demo payment successful',
    },
  };

  const batch = db.batch();
  batch.update(ref, updates);

  if (payment.consultationId) {
    batch.update(
      db.collection('consultations').doc(payment.consultationId),
      {
        paymentStatus: 'paid',
        status: 'confirmed',
        updatedAt: now,
      }
    );
  }

  await batch.commit();
  return { ...payment, ...updates };
}

async function listFarmerPayments(farmerId) {
  const db = getDb();
  const snap = await db
    .collection('payments')
    .where('farmerId', '==', farmerId)
    .get();

  return snap.docs
    .map((doc) => doc.data())
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

module.exports = {
  createPaymentOrder,
  confirmMockPayment,
  confirmRazorpayPayment,
  listFarmerPayments,
};
