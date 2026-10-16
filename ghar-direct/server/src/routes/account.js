'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { HttpError, uid, safeJson, parse, num } = require('../util');
const { signToken } = require('../auth');

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8, 'Use at least 8 characters').max(100),
  name: z.string().trim().min(2, 'Enter your name').max(60),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
const profileSchema = z.object({
  work: z.string().trim().max(120).optional(),
  budget: z.number().int().min(0).max(10000000).optional(),
  moveIn: z.string().trim().max(40).optional(),
  about: z.string().trim().max(300).optional(),
  prompts: z
    .array(z.object({ q: z.string().trim().min(3).max(80), a: z.string().trim().min(1).max(140) }))
    .max(3)
    .optional(),
});
const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  profile: profileSchema.optional(),
});
const verifySchema = z.object({
  docType: z.enum(['aadhaar', 'passport', 'driving_licence', 'voter_id']).default('aadhaar'),
});

function userView(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    idStatus: u.id_status,
    idVerified: u.id_status === 'verified',
    profile: safeJson(u.profile, {}),
    createdAt: num(u.created_at),
  };
}

function accountRouter({ db, cfg, auth, idProvider }) {
  const router = express.Router();

  router.post('/auth/register', async (req, res) => {
    const input = parse(registerSchema, req.body);
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [input.email]);
    if (existing.rows.length) throw new HttpError(409, 'email_taken', 'That email already has an account. Log in instead.');
    const hash = await bcrypt.hash(input.password, 10);
    const id = uid();
    await db.query(
      'INSERT INTO users (id, email, password_hash, name, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, input.email, hash, input.name, Date.now()]
    );
    const user = (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
    res.status(201).json({ token: signToken(user, cfg), user: userView(user) });
  });

  router.post('/auth/login', async (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = (await db.query('SELECT * FROM users WHERE email = $1', [input.email])).rows[0];
    const ok = user && (await bcrypt.compare(input.password, user.password_hash));
    if (!ok) throw new HttpError(401, 'bad_login', 'Wrong email or password.');
    if (user.banned) throw new HttpError(403, 'account_banned', 'This account has been suspended.');
    res.json({ token: signToken(user, cfg), user: userView(user) });
  });

  router.get('/me', auth, (req, res) => {
    res.json({ user: userView(req.user) });
  });

  router.put('/me', auth, async (req, res) => {
    const input = parse(updateMeSchema, req.body);
    const profile = input.profile ? { ...safeJson(req.user.profile, {}), ...input.profile } : safeJson(req.user.profile, {});
    await db.query('UPDATE users SET name = $1, profile = $2 WHERE id = $3', [
      input.name || req.user.name,
      JSON.stringify(profile),
      req.user.id,
    ]);
    const user = (await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0];
    res.json({ user: userView(user) });
  });

  router.post('/me/verify-id', auth, async (req, res) => {
    const input = parse(verifySchema, req.body);
    const result = await idProvider.start(req.user, input);
    const status = result.status === 'verified' ? 'verified' : result.status === 'pending' ? 'pending' : 'none';
    await db.query('UPDATE users SET id_status = $1, id_verified_at = $2 WHERE id = $3', [
      status,
      status === 'verified' ? Date.now() : null,
      req.user.id,
    ]);
    const user = (await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0];
    res.json({ user: userView(user), provider: idProvider.name });
  });

  // Deletes the account and everything attached to it.
  router.delete('/me', auth, async (req, res) => {
    const id = req.user.id;
    const convs = (await db.query('SELECT id FROM conversations WHERE renter_id = $1 OR owner_id = $1', [id])).rows;
    for (const c of convs) await db.query('DELETE FROM messages WHERE conversation_id = $1', [c.id]);
    await db.query('DELETE FROM conversations WHERE renter_id = $1 OR owner_id = $1', [id]);
    await db.query("UPDATE listings SET status = 'removed' WHERE owner_id = $1", [id]);
    await db.query('DELETE FROM swipes WHERE user_id = $1', [id]);
    await db.query('DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1', [id]);
    await db.query('DELETE FROM photo_nonces WHERE user_id = $1', [id]);
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { accountRouter, userView };
