const { getAuth, getDb } = require('../config/firebase');

/**
 * Verifies Firebase ID token from Authorization: Bearer <token>
 * Attaches req.user = { uid, email, role, profile }
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const decoded = await getAuth().verifyIdToken(token);
    const db = getDb();
    const userSnap = await db.collection('users').doc(decoded.uid).get();

    if (!userSnap.exists) {
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        role: null,
        profile: null,
      };
    } else {
      const data = userSnap.data();
      req.user = {
        uid: decoded.uid,
        email: decoded.email || data.email,
        role: data.role,
        profile: data,
      };
    }

    next();
  } catch (err) {
    console.error('[auth]', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/** Optional auth — attaches user if token present, otherwise continues */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
}

module.exports = { authenticate, optionalAuth };
