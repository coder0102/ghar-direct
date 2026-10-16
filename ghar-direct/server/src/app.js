'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { HttpError } = require('./util');
const { requireAuth } = require('./auth');
const { accountRouter } = require('./routes/account');
const { listingsRouter } = require('./routes/listings');
const { feedRouter } = require('./routes/feed');
const { conversationsRouter } = require('./routes/conversations');
const { safetyRouter } = require('./routes/safety');
const { adminRouter } = require('./routes/admin');

// Builds the whole API. Everything it needs is passed in, which is what lets the tests
// run it against an in-memory database.
function createApp({ db, cfg, storage, idProvider, rateLimits = true }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  if (rateLimits) {
    app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
    app.use('/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  }

  if (storage.kind === 'local') {
    app.use('/media', express.static(storage.root, { maxAge: '365d', immutable: true, index: false, dotfiles: 'deny' }));
  }

  app.get('/health', (req, res) => res.json({ ok: true }));

  const auth = requireAuth(db, cfg);
  const deps = { db, cfg, auth, storage, idProvider };
  app.use(accountRouter(deps));
  app.use('/listings', listingsRouter(deps));
  app.use(feedRouter(deps));
  app.use(conversationsRouter(deps));
  app.use(safetyRouter(deps));
  app.use(adminRouter(deps));

  app.use((req, res, next) => next(new HttpError(404, 'not_found', 'Not found.')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    }
    if (err && err.name === 'MulterError') {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too large (8 MB max).' : 'Upload failed.';
      return res.status(400).json({ error: 'upload_error', message: msg });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON.' });
    }
    console.error(err);
    res.status(500).json({ error: 'server_error', message: 'Something went wrong on our side.' });
  });

  return app;
}

module.exports = { createApp };
