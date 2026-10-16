'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { HttpError, num, parse } = require('../util');

const resolveSchema = z.object({
  action: z.enum(['dismiss', 'remove_listing', 'ban_user', 'restore_listing']),
});

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function adminRouter({ db, cfg }) {
  const router = express.Router();

  // The page itself holds no data and no secret. It asks for the token in the browser.
  router.get('/admin', (req, res) => {
    if (!cfg.adminToken) return res.status(404).send('Admin is off. Set ADMIN_TOKEN to turn it on.');
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'"
    );
    res.type('html').send(fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8'));
  });

  function guard(req, res, next) {
    if (!cfg.adminToken) return next(new HttpError(404, 'not_found', 'Not found.'));
    if (!sameSecret(req.headers['x-admin-token'] || '', cfg.adminToken)) {
      return next(new HttpError(401, 'unauthorized', 'Wrong admin token.'));
    }
    next();
  }

  router.get('/admin/api/reports', guard, async (req, res) => {
    const status = req.query.status === 'all' ? null : 'open';
    const rows = (
      await db.query(
        `SELECT r.*, t.name AS target_name, t.email AS target_email, t.banned AS target_banned,
                p.name AS reporter_name, l.locality AS listing_locality, l.status AS listing_status
         FROM reports r
         JOIN users t ON t.id = r.target_user_id
         JOIN users p ON p.id = r.reporter_id
         LEFT JOIN listings l ON l.id = r.listing_id
         ${status ? "WHERE r.status = 'open'" : ''}
         ORDER BY r.created_at DESC LIMIT 200`
      )
    ).rows;
    res.json({
      reports: rows.map((r) => ({
        id: r.id, reason: r.reason, details: r.details, status: r.status, createdAt: num(r.created_at),
        reporter: r.reporter_name, target: { id: r.target_user_id, name: r.target_name, email: r.target_email, banned: !!r.target_banned },
        listing: r.listing_id ? { id: r.listing_id, locality: r.listing_locality, status: r.listing_status } : null,
      })),
    });
  });

  router.post('/admin/api/reports/:id/resolve', guard, async (req, res) => {
    const input = parse(resolveSchema, req.body);
    const r = (await db.query('SELECT * FROM reports WHERE id = $1', [req.params.id])).rows[0];
    if (!r) throw new HttpError(404, 'not_found', 'Report not found.');
    let newStatus = 'actioned';
    if (input.action === 'dismiss') newStatus = 'dismissed';
    if (input.action === 'remove_listing' && r.listing_id) {
      await db.query("UPDATE listings SET status = 'removed' WHERE id = $1", [r.listing_id]);
    }
    if (input.action === 'restore_listing') {
      await db.query("UPDATE listings SET status = 'published' WHERE owner_id = $1 AND status = 'under_review'", [r.target_user_id]);
      newStatus = 'dismissed';
    }
    if (input.action === 'ban_user') {
      await db.query('UPDATE users SET banned = 1 WHERE id = $1', [r.target_user_id]);
      await db.query("UPDATE listings SET status = 'removed' WHERE owner_id = $1", [r.target_user_id]);
    }
    await db.query('UPDATE reports SET status = $1 WHERE id = $2', [newStatus, r.id]);
    res.json({ ok: true, status: newStatus });
  });

  return router;
}

module.exports = { adminRouter };
