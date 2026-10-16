'use strict';

const express = require('express');
const { z } = require('zod');
const { HttpError, uid, num, safeJson, firstName, parse, ROOM_LABELS } = require('../util');
const { haversineM, roundArea } = require('../geo');
const { listingView, loadPhotos, ownerInfo } = require('./listings');
const { addMessage, blockedBetween } = require('./conversations');

const feedQuery = z.object({
  type: z.enum(['flat', 'flatmate']).optional(),
  maxRent: z.coerce.number().int().positive().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

const likeSchema = z.object({
  targetType: z.enum(['photo', 'prompt']).optional(),
  targetIndex: z.number().int().min(0).max(20).optional(),
  comment: z.string().trim().max(500).default(''),
});

const DAILY_LIKE_CAP = 30;

function feedRouter({ db, auth, storage }) {
  const router = express.Router();

  async function upsertSwipe(userId, listingId, action) {
    await db.query('DELETE FROM swipes WHERE user_id = $1 AND listing_id = $2', [userId, listingId]);
    await db.query('INSERT INTO swipes (user_id, listing_id, action, created_at) VALUES ($1,$2,$3,$4)', [
      userId, listingId, action, Date.now(),
    ]);
  }

  router.get('/feed', auth, async (req, res) => {
    const q = parse(feedQuery, req.query);
    const me = req.user.id;
    const params = [me];
    let sql = `SELECT l.*, u.name AS owner_name, u.id_status AS owner_id_status
               FROM listings l JOIN users u ON u.id = l.owner_id
               WHERE l.status = 'published' AND u.banned = 0 AND l.owner_id <> $1`;
    if (q.type) { params.push(q.type); sql += ` AND l.type = $${params.length}`; }
    if (q.maxRent) { params.push(q.maxRent); sql += ` AND l.rent <= $${params.length}`; }
    const rows = (await db.query(sql, params)).rows;

    const seen = new Set((await db.query('SELECT listing_id FROM swipes WHERE user_id = $1', [me])).rows.map((r) => r.listing_id));
    const blocks = (await db.query('SELECT blocker_id, blocked_id FROM blocks WHERE blocker_id = $1 OR blocked_id = $1', [me])).rows;
    const blockedSet = new Set(blocks.map((b) => (b.blocker_id === me ? b.blocked_id : b.blocker_id)));

    let items = rows.filter((r) => !seen.has(r.id) && !blockedSet.has(r.owner_id));
    const hasPos = q.lat !== undefined && q.lng !== undefined;
    if (hasPos) {
      // Distance uses the rounded (about 1 km) area, never the exact address.
      for (const r of items) r._km = haversineM(q.lat, q.lng, roundArea(r.lat), roundArea(r.lng)) / 1000;
      if (q.radiusKm) items = items.filter((r) => r._km <= q.radiusKm);
      items.sort((a, b) => a._km - b._km);
    } else {
      items.sort((a, b) => num(b.published_at) - num(a.published_at));
    }
    const remaining = items.length;
    items = items.slice(0, q.limit);
    const photos = await loadPhotos(db, items.map((r) => r.id));
    res.json({
      remaining,
      listings: items.map((r) =>
        listingView(r, photos[r.id] || [], storage, {
          owner: ownerInfo({ name: r.owner_name, id_status: r.owner_id_status }),
          distanceKm: hasPos ? Math.round(r._km * 10) / 10 : undefined,
        })
      ),
    });
  });

  router.post('/listings/:id/pass', auth, async (req, res) => {
    const row = (await db.query('SELECT id, owner_id FROM listings WHERE id = $1', [req.params.id])).rows[0];
    if (!row || row.owner_id === req.user.id) throw new HttpError(404, 'not_found', 'Listing not found.');
    await upsertSwipe(req.user.id, row.id, 'pass');
    res.json({ ok: true });
  });

  // Like the whole listing, or one photo / one prompt answer, with an optional comment.
  router.post('/listings/:id/like', auth, async (req, res) => {
    const me = req.user.id;
    const input = parse(likeSchema, req.body);
    const row = (await db.query('SELECT * FROM listings WHERE id = $1', [req.params.id])).rows[0];
    if (!row || row.status !== 'published') throw new HttpError(404, 'not_found', 'Listing not found.');
    if (row.owner_id === me) throw new HttpError(400, 'own_listing', 'This is your own listing.');
    const owner = (await db.query('SELECT * FROM users WHERE id = $1', [row.owner_id])).rows[0];
    if (!owner || owner.banned || (await blockedBetween(db, me, row.owner_id))) {
      throw new HttpError(404, 'not_found', 'Listing not found.');
    }

    // The quote is built here from the real listing so it cannot be faked.
    let quote = null;
    if (input.targetType) {
      const idx = input.targetIndex === undefined ? -1 : input.targetIndex;
      if (input.targetType === 'photo') {
        const p = ((await loadPhotos(db, [row.id]))[row.id] || [])[idx];
        if (!p) throw new HttpError(400, 'invalid_input', 'That photo does not exist.');
        quote = { label: `${ROOM_LABELS[p.room] || 'Photo'} photo`, text: '' };
      } else {
        const pr = safeJson(row.prompts, [])[idx];
        if (!pr) throw new HttpError(400, 'invalid_input', 'That prompt does not exist.');
        quote = { label: pr.q, text: pr.a };
      }
    }
    const body =
      input.comment ||
      (quote
        ? 'This one got me.'
        : `Hi ${firstName(owner.name)}! I liked your ${row.type === 'flatmate' ? 'room' : 'flat'} in ${row.locality}.`);

    let conv = (
      await db.query('SELECT * FROM conversations WHERE listing_id = $1 AND renter_id = $2', [row.id, me])
    ).rows[0];
    if (conv) {
      if (conv.status === 'declined') throw new HttpError(403, 'declined', 'This chat was closed.');
      if (conv.status === 'pending') {
        throw new HttpError(409, 'already_sent', `You already messaged ${firstName(owner.name)}. Wait for a reply.`);
      }
    } else {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const cap = await db.query('SELECT COUNT(*) AS n FROM conversations WHERE renter_id = $1 AND created_at > $2', [me, since]);
      if (Number(cap.rows[0].n) >= DAILY_LIKE_CAP) {
        throw new HttpError(429, 'daily_limit', 'That is a lot of likes for one day. Come back tomorrow.');
      }
      const id = uid();
      const now = Date.now();
      await db.query(
        `INSERT INTO conversations (id, listing_id, renter_id, owner_id, status, renter_last_read, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'pending',$5,$5,$5)`,
        [id, row.id, me, row.owner_id, now]
      );
      conv = { id, status: 'pending' };
    }
    await addMessage(db, conv.id, me, body, quote);
    await upsertSwipe(me, row.id, 'like');
    res.status(201).json({ conversationId: conv.id, status: conv.status });
  });

  return router;
}

module.exports = { feedRouter };
