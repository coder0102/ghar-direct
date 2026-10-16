'use strict';

const express = require('express');
const { z } = require('zod');
const { HttpError, uid, parse } = require('../util');

const REASONS = ['fake_listing', 'broker', 'asked_money', 'abusive', 'discrimination', 'other'];
const AUTO_REVIEW_AFTER = 3; // distinct people reporting the same user

const reportSchema = z
  .object({
    conversationId: z.string().max(80).optional(),
    listingId: z.string().max(80).optional(),
    reason: z.enum(REASONS),
    details: z.string().trim().max(500).default(''),
    block: z.boolean().default(false),
  })
  .refine((d) => d.conversationId || d.listingId, { message: 'Say which chat or listing you are reporting' });

function safetyRouter({ db, auth }) {
  const router = express.Router();

  async function addBlock(blocker, blocked) {
    await db.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [blocker, blocked]);
    await db.query('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1,$2,$3)', [blocker, blocked, Date.now()]);
    // Close any chat between the two of them.
    await db.query(
      `UPDATE conversations SET status = 'declined'
       WHERE (renter_id = $1 AND owner_id = $2) OR (renter_id = $2 AND owner_id = $1)`,
      [blocker, blocked]
    );
  }

  router.post('/reports', auth, async (req, res) => {
    const me = req.user.id;
    const input = parse(reportSchema, req.body);
    let targetId = null;
    let listingId = input.listingId || null;
    let conversationId = null;

    if (input.conversationId) {
      const c = (await db.query('SELECT * FROM conversations WHERE id = $1', [input.conversationId])).rows[0];
      if (!c || (c.renter_id !== me && c.owner_id !== me)) throw new HttpError(404, 'not_found', 'Chat not found.');
      targetId = c.renter_id === me ? c.owner_id : c.renter_id;
      conversationId = c.id;
      listingId = listingId || c.listing_id;
    } else {
      const l = (await db.query('SELECT * FROM listings WHERE id = $1', [input.listingId])).rows[0];
      if (!l) throw new HttpError(404, 'not_found', 'Listing not found.');
      targetId = l.owner_id;
    }
    if (targetId === me) throw new HttpError(400, 'self_report', 'You cannot report yourself.');

    // The same person reporting the same user twice in a day is counted once.
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dup = await db.query(
      "SELECT 1 FROM reports WHERE reporter_id = $1 AND target_user_id = $2 AND status = 'open' AND created_at > $3",
      [me, targetId, dayAgo]
    );
    if (!dup.rows.length) {
      await db.query(
        `INSERT INTO reports (id, reporter_id, target_user_id, listing_id, conversation_id, reason, details, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uid(), me, targetId, listingId, conversationId, input.reason, input.details, Date.now()]
      );
      // Several different people reporting the same user hides their listings until a person checks.
      const distinct = await db.query("SELECT DISTINCT reporter_id FROM reports WHERE target_user_id = $1 AND status = 'open'", [targetId]);
      if (distinct.rows.length >= AUTO_REVIEW_AFTER) {
        await db.query("UPDATE listings SET status = 'under_review' WHERE owner_id = $1 AND status = 'published'", [targetId]);
      }
    }
    if (input.block) await addBlock(me, targetId);
    res.status(201).json({ ok: true, blocked: input.block });
  });

  router.post('/blocks', auth, async (req, res) => {
    const input = parse(z.object({ conversationId: z.string().max(80) }), req.body);
    const c = (await db.query('SELECT * FROM conversations WHERE id = $1', [input.conversationId])).rows[0];
    if (!c || (c.renter_id !== req.user.id && c.owner_id !== req.user.id)) throw new HttpError(404, 'not_found', 'Chat not found.');
    await addBlock(req.user.id, c.renter_id === req.user.id ? c.owner_id : c.renter_id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { safetyRouter, REASONS };
