'use strict';

const jwt = require('jsonwebtoken');
const { HttpError } = require('./util');

function signToken(user, cfg) {
  return jwt.sign({ sub: user.id }, cfg.jwtSecret, { expiresIn: '30d' });
}

function requireAuth(db, cfg) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(new HttpError(401, 'unauthorized', 'Log in first.'));
    let payload;
    try {
      payload = jwt.verify(token, cfg.jwtSecret);
    } catch (e) {
      return next(new HttpError(401, 'unauthorized', 'Your session expired. Log in again.'));
    }
    const r = await db.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const user = r.rows[0];
    if (!user) return next(new HttpError(401, 'unauthorized', 'Account not found.'));
    if (user.banned) return next(new HttpError(403, 'account_banned', 'This account has been suspended.'));
    req.user = user;
    next();
  };
}

module.exports = { signToken, requireAuth };
