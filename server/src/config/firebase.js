const admin = require('firebase-admin');
const { env } = require('./env');

let db = null;
let bucket = null;
let auth = null;
let initialized = false;

function initFirebase() {
  if (initialized) {
    return { admin, db, bucket, auth };
  }

  const { projectId, clientEmail, privateKey, storageBucket } = env.firebase;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: storageBucket || undefined,
    });
    initialized = true;
    console.log('[Firebase] Initialized with service account credentials');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: storageBucket || undefined,
    });
    initialized = true;
    console.log('[Firebase] Initialized with application default credentials');
  } else {
    console.warn(
      '[Firebase] Credentials missing. Running in limited mode. Set FIREBASE_* env vars for full functionality.'
    );
    return { admin: null, db: null, bucket: null, auth: null, initialized: false };
  }

  db = admin.firestore();
  auth = admin.auth();
  bucket = storageBucket ? admin.storage().bucket() : null;

  return { admin, db, bucket, auth, initialized: true };
}

function getDb() {
  if (!db) initFirebase();
  if (!db) throw new Error('Firebase is not configured. Set FIREBASE_* environment variables.');
  return db;
}

function getAuth() {
  if (!auth) initFirebase();
  if (!auth) throw new Error('Firebase Auth is not configured.');
  return auth;
}

function getBucket() {
  if (!bucket) initFirebase();
  return bucket;
}

function getAdmin() {
  if (!initialized) initFirebase();
  return admin;
}

module.exports = {
  initFirebase,
  getDb,
  getAuth,
  getBucket,
  getAdmin,
};
