const ROLES = {
  FARMER: 'farmer',
  PESTICIDE_OWNER: 'pesticide_owner',
  LEAF_DOCTOR: 'leaf_doctor',
};

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ success: false, message: 'Profile incomplete. Select a role first.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    next();
  };
}

function requireSelfOrRole(getOwnerId, ...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (roles.includes(req.user.role)) {
      return next();
    }
    const ownerId = typeof getOwnerId === 'function' ? getOwnerId(req) : req.params[getOwnerId];
    if (ownerId && ownerId === req.user.uid) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied' });
  };
}

module.exports = { ROLES, requireRole, requireSelfOrRole };
