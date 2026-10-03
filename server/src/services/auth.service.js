const { getDb, getAuth } = require('../config/firebase');
const { ROLES } = require('../middleware/roles');

const VALID_ROLES = Object.values(ROLES);

async function upsertProfile(uid, email, payload) {
  const db = getDb();
  const { role, displayName, phone, location, expertise, licenseNumber, shopName } = payload;

  if (!role || !VALID_ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role. Use: ${VALID_ROLES.join(', ')}`), { status: 400 });
  }

  const now = new Date().toISOString();
  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();

  const base = {
    uid,
    email: email || payload.email || '',
    role,
    displayName: displayName || existing.data()?.displayName || email?.split('@')[0] || 'User',
    phone: phone || existing.data()?.phone || '',
    updatedAt: now,
  };

  if (!existing.exists) {
    base.createdAt = now;
  }

  await userRef.set(base, { merge: true });

  // Role-specific collections
  if (role === ROLES.FARMER) {
    const farmerData = {
      farmerId: uid,
      displayName: base.displayName,
      email: base.email,
      phone: base.phone,
      location: location || '',
      updatedAt: now,
      createdAt: existing.exists ? existing.data()?.createdAt || now : now,
    };
    await db.collection('farmers').doc(uid).set(farmerData, { merge: true });

    // Ensure quota doc exists
    const monthKey = currentMonthKey();
    const quotaRef = db.collection('consultationQuota').doc(`${uid}_${monthKey}`);
    const quotaSnap = await quotaRef.get();
    if (!quotaSnap.exists) {
      await quotaRef.set({
        farmerId: uid,
        currentMonth: monthKey,
        freeCallsUsed: 0,
        freeCallsLimit: Number(process.env.FREE_CONSULTATIONS_PER_MONTH || 5),
        updatedAt: now,
      });
    }
  }

  if (role === ROLES.PESTICIDE_OWNER) {
    await db.collection('pesticideOwners').doc(uid).set(
      {
        ownerId: uid,
        displayName: base.displayName,
        email: base.email,
        phone: base.phone,
        shopName: shopName || '',
        location: location || '',
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );
  }

  if (role === ROLES.LEAF_DOCTOR) {
    await db.collection('doctors').doc(uid).set(
      {
        doctorId: uid,
        displayName: base.displayName,
        email: base.email,
        phone: base.phone,
        expertise: expertise || 'Cotton diseases',
        licenseNumber: licenseNumber || '',
        location: location || '',
        bio: payload.bio || '',
        consultationFee: Number(payload.consultationFee) || Number(process.env.DEFAULT_CONSULTATION_FEE || 299),
        availableSlots: [],
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );
  }

  const snap = await userRef.get();
  return snap.data();
}

async function getProfile(uid) {
  const db = getDb();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;

  const user = snap.data();
  let roleProfile = null;

  if (user.role === ROLES.FARMER) {
    const f = await db.collection('farmers').doc(uid).get();
    roleProfile = f.exists ? f.data() : null;
  } else if (user.role === ROLES.PESTICIDE_OWNER) {
    const o = await db.collection('pesticideOwners').doc(uid).get();
    roleProfile = o.exists ? o.data() : null;
  } else if (user.role === ROLES.LEAF_DOCTOR) {
    const d = await db.collection('doctors').doc(uid).get();
    roleProfile = d.exists ? d.data() : null;
  }

  return { ...user, roleProfile };
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
  upsertProfile,
  getProfile,
  currentMonthKey,
  VALID_ROLES,
};
