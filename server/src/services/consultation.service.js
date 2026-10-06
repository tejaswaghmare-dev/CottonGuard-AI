
const googleMeetService = require('./googleMeet.service');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');
const { env } = require('../config/env');
const { getQuota, consumeFreeSlot } = require('./quota.service');
const { createPaymentOrder } = require('./payment.service');
const { assertFarmOwner } = require('./farm.service');



async function listDoctors() {
  const db = getDb();
  const snap = await db.collection('doctors').get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      doctorId: data.doctorId,
      displayName: data.displayName,
      expertise: data.expertise,
      location: data.location,
      bio: data.bio,
      consultationFee: data.consultationFee,
      availableSlots: data.availableSlots || [],
      phone: undefined, // hide phone from public list
    };
  });
}

async function getDoctor(doctorId) {
  const db = getDb();
  const snap = await db.collection('doctors').doc(doctorId).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function setAvailability(doctorId, slots) {
  const db = getDb();
  await db.collection('doctors').doc(doctorId).set(
    {
      availableSlots: slots || [],
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  return getDoctor(doctorId);
}

async function updateDoctorProfile(doctorId, data) {
  const db = getDb();
  const allowed = ['displayName', 'phone', 'expertise', 'licenseNumber', 'location', 'bio', 'consultationFee'];
  const updates = { updatedAt: new Date().toISOString() };
  allowed.forEach((k) => {
    if (data[k] !== undefined) updates[k] = k === 'consultationFee' ? Number(data[k]) : data[k];
  });
  await db.collection('doctors').doc(doctorId).set(updates, { merge: true });
  await db.collection('users').doc(doctorId).set(
    {
      displayName: updates.displayName,
      phone: updates.phone,
      updatedAt: updates.updatedAt,
    },
    { merge: true }
  );
  return getDoctor(doctorId);
}

/**
 * Book consultation — quota validated on backend.
 */
async function bookConsultation(farmerId, payload) {
  const { doctorId, farmId, date, time, consultationType, notes } = payload;
  if (!doctorId || !date || !time) {
    throw Object.assign(new Error('doctorId, date, and time are required'), { status: 400 });
  }

  if (farmId) {
    await assertFarmOwner(farmId, farmerId);
  }

  const doctor = await getDoctor(doctorId);
  if (!doctor) throw Object.assign(new Error('Doctor not found'), { status: 404 });

  const db = getDb();
  const consultationId = uuidv4();
  const now = new Date().toISOString();
  const fee = Number(doctor.consultationFee) || env.defaultConsultationFee;

  // Server-side free quota check
  const quota = await getQuota(farmerId);
  let isFree = false;
  let paymentStatus = 'not_required';
  let status = 'pending';
  let payment = null;

  if (quota.remaining > 0) {
    const consumed = await consumeFreeSlot(farmerId);
    if (consumed.allowed && consumed.isFree) {
      isFree = true;
      paymentStatus = 'free';
      status = 'confirmed';
    }
  }

  if (!isFree) {
    paymentStatus = 'pending';
    status = 'awaiting_payment';
    payment = await createPaymentOrder({
      farmerId,
      amount: fee,
      purpose: 'consultation',
      consultationId,
      metadata: { doctorId, date, time },
    });
  }

  

  const consultation = {
    consultationId,
    farmerId,
    doctorId,
    farmId: farmId || null,
    date,
    time,
    status,
    meetingLink: null,
    meetingName: null,
    meetingCode: null,
    meetingCreatedAt: null,
    consultationType: consultationType || 'video',
    fee: isFree ? 0 : fee,
    isFree,
    paymentStatus,
    paymentId: payment?.paymentId || null,
    notes: notes || '',
    doctorNotes: '',
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('consultations').doc(consultationId).set(consultation);

  // Remove slot from doctor availability if present
  if (doctor.availableSlots?.length) {
    const remaining = doctor.availableSlots.filter((s) => !(s.date === date && s.time === time));
    await db.collection('doctors').doc(doctorId).update({ availableSlots: remaining });
  }

  return {
    consultation,
    payment,
    quotaMessage: isFree
      ? null
      : 'Monthly free consultation limit reached. Please complete paid consultation.',
  };
}

async function listConsultations(user) {
  const db = getDb();
  let snap;
  if (user.role === 'farmer') {
    snap = await db.collection('consultations').where('farmerId', '==', user.uid).get();
  } else if (user.role === 'leaf_doctor') {
    snap = await db.collection('consultations').where('doctorId', '==', user.uid).get();
  } else {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  const list = snap.docs.map((d) => d.data());
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

async function getConsultation(consultationId, user) {
  const db = getDb();
  const snap = await db.collection('consultations').doc(consultationId).get();
  if (!snap.exists) throw Object.assign(new Error('Consultation not found'), { status: 404 });
  const c = snap.data();

  if (user.role === 'farmer' && c.farmerId !== user.uid) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  if (user.role === 'leaf_doctor' && c.doctorId !== user.uid) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }

  // Hide meeting link until confirmed/accepted and authorized
  if (!['confirmed', 'accepted', 'completed'].includes(c.status) && user.role === 'farmer' && c.paymentStatus === 'pending') {
    return { ...c, meetingLink: null };
  }
  return c;
}

async function updateConsultation(consultationId, user, data) {
  const c = await getConsultation(consultationId, user);
  const db = getDb();
  const updates = {
    updatedAt: new Date().toISOString(),
  };

  if (user.role === 'leaf_doctor') {
    if (data.status) {
      const allowedStatuses = ['accepted', 'rejected', 'completed'];

      if (!allowedStatuses.includes(data.status)) {
        throw Object.assign(
          new Error('Invalid consultation status'),
          { status: 400 }
        );
      }

      /*
       * DOCTOR ACCEPTS CONSULTATION
       *
       * Only confirmed/paid consultations can be accepted.
       * Free consultations are already confirmed.
       */
      if (data.status === 'accepted') {
        const canAccept =
          c.status === 'confirmed' ||
          (c.status === 'awaiting_payment' && c.paymentStatus === 'paid') ||
          c.status === 'accepted';

        if (!canAccept) {
          throw Object.assign(
            new Error(
              'Consultation cannot be accepted until it is confirmed or payment is completed.'
            ),
            { status: 400 }
          );
        }

        updates.status = 'accepted';

        /*
         * Create REAL Google Meet only if one does not already exist.
         */
        if (!c.meetingLink) {
          try {
            const meeting = await googleMeetService.createMeetSpace();

            updates.meetingLink = meeting.meetingUri;
            updates.meetingName = meeting.name;
            updates.meetingCode = meeting.meetingCode;
            updates.meetingCreatedAt = new Date().toISOString();

            console.log(
              `Google Meet created for consultation ${consultationId}: ${meeting.meetingUri}`
            );
          } catch (error) {
            console.error(
              'Google Meet creation failed:',
              error.message
            );

            throw Object.assign(
              new Error(
                `Doctor accepted request, but Google Meet creation failed: ${error.message}`
              ),
              { status: 500 }
            );
          }
        }
      }

      if (data.status === 'rejected') {
        updates.status = 'rejected';
      }

      if (data.status === 'completed') {
        updates.status = 'completed';
      }
    }

    if (data.doctorNotes !== undefined) {
      updates.doctorNotes = data.doctorNotes;
    }

    if (data.notes !== undefined) {
      updates.doctorNotes = data.notes;
    }
  }

  if (user.role === 'farmer') {
    if (data.status === 'cancelled') {
      if (['completed', 'cancelled', 'rejected'].includes(c.status)) {
        throw Object.assign(
          new Error('This consultation cannot be cancelled'),
          { status: 400 }
        );
      }

      updates.status = 'cancelled';
    }
  }

  await db
    .collection('consultations')
    .doc(consultationId)
    .update(updates);

  return {
    ...c,
    ...updates,
  };
}

async function getFarmerFarmHistoryForDoctor(doctorId, farmerId, farmId) {
  const db = getDb();
  // Ensure there is a consultation linking doctor and farmer
  const snap = await db
    .collection('consultations')
    .where('doctorId', '==', doctorId)
    .where('farmerId', '==', farmerId)
    .get();
  if (snap.empty) {
    throw Object.assign(new Error('No shared consultation with this farmer'), { status: 403 });
  }

  let query = db.collection('predictions').where('farmerId', '==', farmerId);
  const predSnap = await query.get();
  let list = predSnap.docs.map((d) => d.data());
  if (farmId) list = list.filter((p) => p.farmId === farmId);
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

module.exports = {
  listDoctors,
  getDoctor,
  setAvailability,
  updateDoctorProfile,
  bookConsultation,
  listConsultations,
  getConsultation,
  updateConsultation,
  getFarmerFarmHistoryForDoctor,
};
