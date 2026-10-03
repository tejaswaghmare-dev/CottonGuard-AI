const { getDb } = require('../config/firebase');
const { currentMonthKey } = require('./auth.service');
const { env } = require('../config/env');

async function getQuota(farmerId) {
  const db = getDb();
  const month = currentMonthKey();
  const docId = `${farmerId}_${month}`;
  const ref = db.collection('consultationQuota').doc(docId);
  const snap = await ref.get();

  if (!snap.exists) {
    const data = {
      farmerId,
      currentMonth: month,
      freeCallsUsed: 0,
      freeCallsLimit: env.freeConsultationsPerMonth,
      updatedAt: new Date().toISOString(),
    };
    await ref.set(data);
    return {
      ...data,
      remaining: data.freeCallsLimit,
    };
  }

  const data = snap.data();
  // Month rollover: if stored month differs, reset
  if (data.currentMonth !== month) {
    const reset = {
      farmerId,
      currentMonth: month,
      freeCallsUsed: 0,
      freeCallsLimit: env.freeConsultationsPerMonth,
      updatedAt: new Date().toISOString(),
    };
    await ref.set(reset);
    return { ...reset, remaining: reset.freeCallsLimit };
  }

  return {
    ...data,
    freeCallsLimit: data.freeCallsLimit || env.freeConsultationsPerMonth,
    remaining: Math.max(0, (data.freeCallsLimit || env.freeConsultationsPerMonth) - (data.freeCallsUsed || 0)),
  };
}

/**
 * Server-side quota validation. NEVER trust frontend for free vs paid.
 */
async function consumeFreeSlot(farmerId) {
  const db = getDb();
  const month = currentMonthKey();
  const docId = `${farmerId}_${month}`;
  const ref = db.collection('consultationQuota').doc(docId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const limit = env.freeConsultationsPerMonth;
    let used = 0;
    let currentMonth = month;

    if (snap.exists) {
      const d = snap.data();
      if (d.currentMonth === month) {
        used = d.freeCallsUsed || 0;
      }
    }

    if (used >= limit) {
      return {
        allowed: false,
        isFree: false,
        freeCallsUsed: used,
        freeCallsLimit: limit,
        remaining: 0,
        message: 'Monthly free consultation limit reached.',
      };
    }

    used += 1;
    tx.set(
      ref,
      {
        farmerId,
        currentMonth: month,
        freeCallsUsed: used,
        freeCallsLimit: limit,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return {
      allowed: true,
      isFree: true,
      freeCallsUsed: used,
      freeCallsLimit: limit,
      remaining: limit - used,
    };
  });
}

module.exports = { getQuota, consumeFreeSlot };
