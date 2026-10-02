const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

module.exports = (req, res, next) => {
  const authorization = req.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  const token = authorization.slice(7).trim();
  if (!token || !process.env.JWT_SECRET) {
    return next(new AppError('Invalid or expired token', 401));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.id) throw new Error('Token has no user id');
    req.user = { id: payload.id };
    return next();
  } catch (_error) {
    return next(new AppError('Invalid or expired token', 401));
  }
};