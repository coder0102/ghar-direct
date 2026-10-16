'use strict';

const express = require('express');
const { z } = require('zod');
const { HttpError, num, safeJson, displayName, parse } = require('../util');
const { loadPhotos } = require('./listings');

const messageSchema = z.object({ body: z.string().trim().min(1, 'Write something first').max(1000) });

async function blockedBetween(db, a, b) {
  const r = await db.query(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
    [a, b]
  );
  return r.rows.length > 0;
}

async function loadConv(db, id, userId) {
  const c = (await db.query('SELECT * FROM conversations WHERE id = $1', [id])).rows[0];
  if (!c || (c.renter_id !== userId && c.owner_id !== userId)) {
    throw new HttpError(404, 'not_found', 'Chat not found.');
  }
  return c;
}

async function addMessage(db, convId, senderId, body, quote) {
  const now = Date.now();
  const r = await db.query(
    'INSERT INTO messages (conversation_id, sender_id, body, quote, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [convId, senderId, body, quote ? JSON.stringify(quote) : null, now]
  );
  await db.query('UPDATE conversations SET updated_at = $1 WHERE id = $2', [now, convId]);
  return { id: r.rows[0].id, createdAt: now };
}

function messageView(m, userId) {
  return {
    id: m.id,
    mine: m.sender_id === userId,
    body: m.body,
    quote: m.quote ? safeJson(m.quote, null) : null,
    createdAt: num(m.created_at),
  };
}

function conversationsRouter({ db, auth, storage }) {
  const router = express.Router();

  router.get('/conversations', auth, async (req, res) => {
    const me = req.user.id;
    const convs = (
      await db.query('SELECT * FROM conversations WHERE renter_id = $1 OR owner_id = $1 ORDER BY updated_at DESC', [me])
    ).rows;
    const out = [];
    for (const c of convs) {
      const iAmOwner = c.owner_id === me;
      const otherId = iAmOwner ? c.renter_id : c.owner_id;
      if (await blockedBetween(db, me, otherId)) continue;
      const other = (await db.query('SELECT * FROM users WHERE id = $1', [otherId])).rows[0];
      const listing = (await db.query('SELECT * FROM listings WHERE id = $1', [c.listing_id])).rows[0];
      const last = (await db.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 1', [c.id])).rows[0];
      const lastRead = num(iAmOwner ? c.owner_last_read : c.renter_last_read) || 0;
      const unread = await db.query(
        'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = $1 AND sender_id <> $2 AND created_at > $3',
        [c.id, me, lastRead]
      );
      const photos = listing ? (await loadPhotos(db, [listing.id]))[listing.id] || [] : [];
      out.push({
        id: c.id,
        status: c.status,
        iAm: iAmOwner ? 'owner' : 'renter',
        other: { name: displayName(other ? other.name : ''), idVerified: !!other && other.id_status === 'verified' },
        listing: listing
          ? {
              id: listing.id, type: listing.type, locality: listing.locality, rent: listing.rent, bhk: listing.bhk,
              coverUrl: photos[0] ? storage.url(photos[0].storage_key) : null,
            }
          : null,
        lastMessage: last ? { body: last.body, mine: last.sender_id === me, createdAt: num(last.created_at) } : null,
        unread: Number(unread.rows[0].n),
        updatedAt: num(c.updated_at),
      });
    }
    res.json({ conversations: out });
  });

  router.get('/conversations/:id', auth, async (req, res) => {
    const me = req.user.id;
    const c = await loadConv(db, req.params.id, me);
    const iAmOwner = c.owner_id === me;
    const other = (await db.query('SELECT * FROM users WHERE id = $1', [iAmOwner ? c.renter_id : c.owner_id])).rows[0];
    if (!other || (await blockedBetween(db, me, other.id))) throw new HttpError(404, 'not_found', 'Chat not found.');
    const listing = (await db.query('SELECT * FROM listings WHERE id = $1', [c.listing_id])).rows[0];
    const photos = listing ? (await loadPhotos(db, [listing.id]))[listing.id] || [] : [];
    const view = {
      id: c.id,
      status: c.status,
      iAm: iAmOwner ? 'owner' : 'renter',
      other: {
        name: displayName(other.name),
        role: iAmOwner ? 'Renter' : listing ? listing.role : 'Owner',
        idVerified: other.id_status === 'verified',
        // A renter's card is shown to the owner so they can decide whether to reply.
        profile: iAmOwner ? safeJson(other.profile, {}) : undefined,
      },
      listing: listing
        ? {
            id: listing.id, type: listing.type, status: listing.status, locality: listing.locality, rent: listing.rent,
            bhk: listing.bhk, coverUrl: photos[0] ? storage.url(photos[0].storage_key) : null,
            // The exact address is only shared once the owner has accepted the chat.
            addressLine: iAmOwner || c.status === 'open' ? listing.address_line : undefined,
          }
        : null,
    };
    res.json({ conversation: view });
  });

  router.get('/conversations/:id/messages', auth, async (req, res) => {
    const me = req.user.id;
    const c = await loadConv(db, req.params.id, me);
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    const rows = (
      await db.query('SELECT * FROM messages WHERE conversation_id = $1 AND id > $2 ORDER BY id ASC LIMIT 200', [c.id, after])
    ).rows;
    const col = c.owner_id === me ? 'owner_last_read' : 'renter_last_read';
    await db.query(`UPDATE conversations SET ${col} = $1 WHERE id = $2`, [Date.now(), c.id]);
    res.json({ status: c.status, messages: rows.map((m) => messageView(m, me)) });
  });

  router.post('/conversations/:id/messages', auth, async (req, res) => {
    const me = req.user.id;
    const input = parse(messageSchema, req.body);
    const c = await loadConv(db, req.params.id, me);
    const otherId = c.owner_id === me ? c.renter_id : c.owner_id;
    if (await blockedBetween(db, me, otherId)) throw new HttpError(403, 'blocked', 'You cannot message this person.');
    if (c.status === 'declined') throw new HttpError(403, 'declined', 'This chat was closed.');
    const iAmOwner = c.owner_id === me;
    if (c.status === 'pending') {
      if (!iAmOwner) {
        throw new HttpError(409, 'wait_for_reply', 'Wait for them to reply before sending more messages.');
      }
      // The owner replying opens the chat.
      await db.query("UPDATE conversations SET status = 'open' WHERE id = $1", [c.id]);
    }
    const m = await addMessage(db, c.id, me, input.body, null);
    const col = iAmOwner ? 'owner_last_read' : 'renter_last_read';
    await db.query(`UPDATE conversations SET ${col} = $1 WHERE id = $2`, [m.createdAt, c.id]);
    res.status(201).json({ message: { id: m.id, mine: true, body: input.body, quote: null, createdAt: m.createdAt }, status: iAmOwner ? 'open' : c.status });
  });

  router.post('/conversations/:id/accept', auth, async (req, res) => {
    const c = await loadConv(db, req.params.id, req.user.id);
    if (c.owner_id !== req.user.id) throw new HttpError(403, 'owner_only', 'Only the owner can accept.');
    if (c.status === 'declined') throw new HttpError(409, 'declined', 'This chat was closed.');
    await db.query("UPDATE conversations SET status = 'open' WHERE id = $1", [c.id]);
    res.json({ status: 'open' });
  });

  router.post('/conversations/:id/decline', auth, async (req, res) => {
    const c = await loadConv(db, req.params.id, req.user.id);
    if (c.owner_id !== req.user.id) throw new HttpError(403, 'owner_only', 'Only the owner can decline.');
    await db.query("UPDATE conversations SET status = 'declined' WHERE id = $1", [c.id]);
    res.json({ status: 'declined' });
  });

  return router;
}

module.exports = { conversationsRouter, addMessage, blockedBetween };
