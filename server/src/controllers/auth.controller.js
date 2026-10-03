const authService = require('../services/auth.service');
const { getQuota } = require('../services/quota.service');

async function upsertProfile(req, res, next) {
  try {
    const profile = await authService.upsertProfile(req.user.uid, req.user.email, req.body);
    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.uid);
    let quota = null;
    if (profile?.role === 'farmer') {
      try {
        quota = await getQuota(req.user.uid);
      } catch (_) {}
    }
    res.json({ success: true, profile, quota });
  } catch (err) {
    next(err);
  }
}

module.exports = { upsertProfile, getMe };
