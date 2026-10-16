'use strict';

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const { HttpError, uid, num, safeJson, displayName, placeholders, parse } = require('../util');
const { haversineM, roundArea } = require('../geo');

const ROOMS = ['living', 'bedroom', 'kitchen', 'balcony', 'exterior', 'bath', 'desk', 'terrace', 'other'];
const ROLES = {
  flat: ['Owner', 'Moving-out tenant'],
  flatmate: ['Flatmate host', 'Owner living here', 'Tenant living here'],
};

const tags = z.array(z.string().trim().min(1).max(30)).max(12);
const prompts = z
  .array(z.object({ q: z.string().trim().min(3).max(80), a: z.string().trim().min(1).max(140) }))
  .max(3);

const fields = {
  type: z.enum(['flat', 'flatmate']),
  role: z.string().trim().min(2).max(40),
  locality: z.string().trim().min(2).max(60),
  addressLine: z.string().trim().max(160).default(''),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  bhk: z.number().int().min(1).max(10),
  sqft: z.number().int().min(0).max(20000).default(0),
  rent: z.number().int().min(1).max(10000000),
  deposit: z.string().trim().max(40).default(''),
  furnishing: z.string().trim().max(40).default(''),
  floor: z.string().trim().max(40).default(''),
  availableFrom: z.string().trim().max(40).default(''),
  roomType: z.string().trim().max(60).default(''),
  alreadyLiving: z.number().int().min(0).max(10).default(0),
  nearby: z.string().trim().max(160).default(''),
  tags: tags.default([]),
  prompts: prompts.default([]),
};
const createSchema = z.object(fields).refine((d) => ROLES[d.type].includes(d.role), {
  message: 'role does not match the listing type',
  path: ['role'],
});
const updateSchema = z.object(fields).omit({ type: true }).partial();

const noncePhotoSchema = z.object({
  nonce: z.string().min(10).max(80),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  room: z.enum(ROOMS),
  capturedAt: z.coerce.number().int(),
});

function photoView(p, storage) {
  return { id: p.id, room: p.room, url: storage.url(p.storage_key), capturedAt: num(p.captured_at) };
}

function listingView(row, photos, storage, opts = {}) {
  const v = {
    id: row.id,
    type: row.type,
    role: row.role,
    status: row.status,
    locality: row.locality,
    areaLat: roundArea(row.lat),
    areaLng: roundArea(row.lng),
    bhk: row.bhk,
    sqft: row.sqft,
    rent: row.rent,
    deposit: row.deposit,
    furnishing: row.furnishing,
    floor: row.floor,
    availableFrom: row.available_from,
    roomType: row.room_type,
    alreadyLiving: row.already_living,
    nearby: row.nearby,
    tags: safeJson(row.tags, []),
    prompts: safeJson(row.prompts, []),
    photos: photos.map((p) => photoView(p, storage)),
    publishedAt: num(row.published_at),
  };
  if (opts.owner) v.owner = opts.owner;
  if (opts.distanceKm !== undefined && opts.distanceKm !== null) v.distanceKm = opts.distanceKm;
  if (opts.exact) {
    v.addressLine = row.address_line;
    v.lat = row.lat;
    v.lng = row.lng;
  }
  return v;
}

async function loadPhotos(db, listingIds) {
  const map = {};
  if (!listingIds.length) return map;
  const r = await db.query(
    `SELECT * FROM photos WHERE listing_id IN (${placeholders(listingIds.length)}) ORDER BY position ASC, created_at ASC`,
    listingIds
  );
  for (const p of r.rows) (map[p.listing_id] = map[p.listing_id] || []).push(p);
  return map;
}

function ownerInfo(userRow) {
  return { name: displayName(userRow.name), idVerified: userRow.id_status === 'verified' };
}

function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

function listingsRouter({ db, cfg, auth, storage }) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  async function ownListing(req) {
    const row = (await db.query('SELECT * FROM listings WHERE id = $1', [req.params.id])).rows[0];
    if (!row || row.owner_id !== req.user.id || row.status === 'removed') {
      throw new HttpError(404, 'not_found', 'Listing not found.');
    }
    return row;
  }
  async function photoCount(listingId) {
    const r = await db.query('SELECT COUNT(*) AS n FROM photos WHERE listing_id = $1', [listingId]);
    return Number(r.rows[0].n);
  }
  async function viewOwn(row) {
    const photos = (await loadPhotos(db, [row.id]))[row.id] || [];
    return listingView(row, photos, storage, { exact: true });
  }

  // Create a draft. The lat/lng must be the phone's GPS position while standing at the flat.
  router.post('/', auth, async (req, res) => {
    if (req.user.id_status !== 'verified') {
      throw new HttpError(403, 'id_required', 'Check your ID before listing a place.');
    }
    const input = parse(createSchema, req.body);
    const active = await db.query(
      "SELECT COUNT(*) AS n FROM listings WHERE owner_id = $1 AND status IN ('draft','published','under_review')",
      [req.user.id]
    );
    if (Number(active.rows[0].n) >= 3) {
      throw new HttpError(409, 'too_many_listings', 'You can have up to 3 live listings. Take one down first.');
    }
    const id = uid();
    const now = Date.now();
    await db.query(
      `INSERT INTO listings (id, owner_id, type, role, status, locality, address_line, lat, lng, bhk, sqft, rent, deposit,
         furnishing, floor, available_from, room_type, already_living, nearby, tags, prompts, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)`,
      [id, req.user.id, input.type, input.role, input.locality, input.addressLine, input.lat, input.lng, input.bhk,
       input.sqft, input.rent, input.deposit, input.furnishing, input.floor, input.availableFrom, input.roomType,
       input.alreadyLiving, input.nearby, JSON.stringify(input.tags), JSON.stringify(input.prompts), now]
    );
    const row = (await db.query('SELECT * FROM listings WHERE id = $1', [id])).rows[0];
    res.status(201).json({ listing: await viewOwn(row) });
  });

  router.get('/mine', auth, async (req, res) => {
    const rows = (
      await db.query("SELECT * FROM listings WHERE owner_id = $1 AND status <> 'removed' ORDER BY created_at DESC", [req.user.id])
    ).rows;
    const photos = await loadPhotos(db, rows.map((r) => r.id));
    res.json({ listings: rows.map((r) => listingView(r, photos[r.id] || [], storage, { exact: true })) });
  });

  router.get('/:id', auth, async (req, res) => {
    const row = (await db.query('SELECT * FROM listings WHERE id = $1', [req.params.id])).rows[0];
    if (!row || row.status === 'removed') throw new HttpError(404, 'not_found', 'Listing not found.');
    const photos = (await loadPhotos(db, [row.id]))[row.id] || [];
    if (row.owner_id === req.user.id) return res.json({ listing: listingView(row, photos, storage, { exact: true }) });
    if (row.status !== 'published') throw new HttpError(404, 'not_found', 'Listing not found.');
    const blocked = await db.query(
      'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
      [req.user.id, row.owner_id]
    );
    if (blocked.rows.length) throw new HttpError(404, 'not_found', 'Listing not found.');
    const owner = (await db.query('SELECT * FROM users WHERE id = $1', [row.owner_id])).rows[0];
    res.json({ listing: listingView(row, photos, storage, { owner: ownerInfo(owner) }) });
  });

  router.patch('/:id', auth, async (req, res) => {
    const row = await ownListing(req);
    const input = parse(updateSchema, req.body);
    if ((input.lat !== undefined || input.lng !== undefined) && (await photoCount(row.id)) > 0) {
      throw new HttpError(409, 'location_locked', 'The location cannot change after photos were verified there.');
    }
    const map = {
      role: 'role', locality: 'locality', addressLine: 'address_line', lat: 'lat', lng: 'lng', bhk: 'bhk', sqft: 'sqft',
      rent: 'rent', deposit: 'deposit', furnishing: 'furnishing', floor: 'floor', availableFrom: 'available_from',
      roomType: 'room_type', alreadyLiving: 'already_living', nearby: 'nearby',
    };
    const sets = [];
    const vals = [];
    for (const [k, col] of Object.entries(map)) {
      if (input[k] !== undefined) {
        vals.push(input[k]);
        sets.push(`${col} = $${vals.length}`);
      }
    }
    if (input.role !== undefined && !ROLES[row.type].includes(input.role)) {
      throw new HttpError(400, 'invalid_input', 'role does not match the listing type');
    }
    if (input.tags !== undefined) { vals.push(JSON.stringify(input.tags)); sets.push(`tags = $${vals.length}`); }
    if (input.prompts !== undefined) { vals.push(JSON.stringify(input.prompts)); sets.push(`prompts = $${vals.length}`); }
    vals.push(Date.now());
    sets.push(`updated_at = $${vals.length}`);
    vals.push(row.id);
    await db.query(`UPDATE listings SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    const fresh = (await db.query('SELECT * FROM listings WHERE id = $1', [row.id])).rows[0];
    res.json({ listing: await viewOwn(fresh) });
  });

  // Step 1 of adding a photo: ask for a one-time code, then open the camera right away.
  router.post('/:id/photos/nonce', auth, async (req, res) => {
    const row = await ownListing(req);
    if ((await photoCount(row.id)) >= cfg.maxPhotos) {
      throw new HttpError(409, 'max_photos', `A listing can have up to ${cfg.maxPhotos} photos.`);
    }
    const nonce = crypto.randomBytes(24).toString('hex');
    const issuedAt = Date.now();
    await db.query('INSERT INTO photo_nonces (nonce, user_id, listing_id, issued_at) VALUES ($1,$2,$3,$4)', [
      nonce, req.user.id, row.id, issuedAt,
    ]);
    res.json({ nonce, expiresAt: issuedAt + cfg.nonceTtlMs, maxDistanceM: cfg.maxPhotoDistanceM });
  });

  // Step 2: upload the photo the camera just took, with the phone's GPS position.
  router.post('/:id/photos', auth, upload.single('photo'), async (req, res) => {
    const row = await ownListing(req);
    if (!req.file) throw new HttpError(400, 'no_photo', 'Attach the photo in the "photo" field.');
    const input = parse(noncePhotoSchema, req.body);
    if ((await photoCount(row.id)) >= cfg.maxPhotos) {
      throw new HttpError(409, 'max_photos', `A listing can have up to ${cfg.maxPhotos} photos.`);
    }

    const n = (await db.query('SELECT * FROM photo_nonces WHERE nonce = $1', [input.nonce])).rows[0];
    if (!n || n.user_id !== req.user.id || n.listing_id !== row.id) {
      throw new HttpError(403, 'bad_nonce', 'This photo was not taken through the app camera. Try again.');
    }
    if (n.used) throw new HttpError(403, 'nonce_used', 'This photo request was already used. Take a new photo.');
    const issuedAt = num(n.issued_at);
    if (Date.now() - issuedAt > cfg.nonceTtlMs) {
      throw new HttpError(403, 'nonce_expired', 'That took too long. Take the photo again.');
    }
    if (input.capturedAt < issuedAt - 5000) {
      throw new HttpError(403, 'photo_too_old', 'The photo was taken before the camera was opened. Take a fresh one.');
    }

    const img = detectImage(req.file.buffer);
    if (!img) throw new HttpError(400, 'bad_image', 'Only JPEG, PNG or WebP photos are accepted.');

    const distance = Math.round(haversineM(input.lat, input.lng, row.lat, row.lng));
    if (distance > cfg.maxPhotoDistanceM) {
      throw new HttpError(
        403,
        'too_far',
        `You are ${distance} m from the flat. Photos must be taken within ${cfg.maxPhotoDistanceM} m of it.`
      );
    }

    const sha = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const dup = await db.query('SELECT 1 FROM photos WHERE sha256 = $1', [sha]);
    if (dup.rows.length) throw new HttpError(409, 'duplicate_photo', 'This exact photo is already on a listing.');

    // Mark the code used first so the same request cannot be replayed.
    await db.query('UPDATE photo_nonces SET used = 1 WHERE nonce = $1', [input.nonce]);

    const id = uid();
    const key = `listings/${row.id}/${id}.${img.ext}`;
    await storage.put(key, req.file.buffer, img.type);
    const position = await photoCount(row.id);
    await db.query(
      `INSERT INTO photos (id, listing_id, room, storage_key, sha256, lat, lng, distance_m, captured_at, position, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, row.id, input.room, key, sha, input.lat, input.lng, distance, input.capturedAt, position, Date.now()]
    );
    const p = (await db.query('SELECT * FROM photos WHERE id = $1', [id])).rows[0];
    const count = position + 1;
    res.status(201).json({ photo: photoView(p, storage), count, needed: Math.max(0, cfg.minPhotos - count) });
  });

  router.delete('/:id/photos/:photoId', auth, async (req, res) => {
    const row = await ownListing(req);
    const p = (await db.query('SELECT * FROM photos WHERE id = $1 AND listing_id = $2', [req.params.photoId, row.id])).rows[0];
    if (!p) throw new HttpError(404, 'not_found', 'Photo not found.');
    const count = await photoCount(row.id);
    if (row.status === 'published' && count - 1 < cfg.minPhotos) {
      throw new HttpError(409, 'min_photos', `A live listing needs at least ${cfg.minPhotos} photos.`);
    }
    await db.query('DELETE FROM photos WHERE id = $1', [p.id]);
    try { await storage.remove(p.storage_key); } catch (e) { /* the row is gone, the file is only clutter */ }
    res.json({ ok: true, count: count - 1 });
  });

  router.post('/:id/publish', auth, async (req, res) => {
    const row = await ownListing(req);
    if (req.user.id_status !== 'verified') throw new HttpError(403, 'id_required', 'Check your ID before publishing.');
    if (row.status === 'under_review') throw new HttpError(409, 'under_review', 'This listing is being reviewed.');
    const problems = [];
    const count = await photoCount(row.id);
    if (count < cfg.minPhotos) {
      problems.push(`Add ${cfg.minPhotos - count} more verified photo${cfg.minPhotos - count > 1 ? 's' : ''} (you need at least ${cfg.minPhotos}).`);
    }
    const ps = safeJson(row.prompts, []);
    if (ps.length !== 3) problems.push('Answer exactly three prompts.');
    else {
      if (new Set(ps.map((p) => p.q)).size !== 3) problems.push('Pick three different prompts.');
      if (ps.some((p) => p.a.trim().length < 12)) problems.push('Each prompt answer needs at least a short sentence.');
    }
    if (problems.length) {
      const err = new HttpError(422, 'not_ready', problems[0]);
      err.details = problems;
      throw err;
    }
    const now = Date.now();
    await db.query("UPDATE listings SET status = 'published', published_at = COALESCE(published_at, $1), updated_at = $1 WHERE id = $2", [now, row.id]);
    const fresh = (await db.query('SELECT * FROM listings WHERE id = $1', [row.id])).rows[0];
    res.json({ listing: await viewOwn(fresh) });
  });

  router.post('/:id/takedown', auth, async (req, res) => {
    const row = await ownListing(req);
    await db.query("UPDATE listings SET status = 'taken_down', updated_at = $1 WHERE id = $2", [Date.now(), row.id]);
    const fresh = (await db.query('SELECT * FROM listings WHERE id = $1', [row.id])).rows[0];
    res.json({ listing: await viewOwn(fresh) });
  });

  // Put a taken-down listing back on Explore.
  router.post('/:id/relist', auth, async (req, res) => {
    const row = await ownListing(req);
    if (row.status !== 'taken_down') throw new HttpError(409, 'bad_state', 'Only a taken-down listing can be relisted.');
    await db.query("UPDATE listings SET status = 'published', updated_at = $1 WHERE id = $2", [Date.now(), row.id]);
    const fresh = (await db.query('SELECT * FROM listings WHERE id = $1', [row.id])).rows[0];
    res.json({ listing: await viewOwn(fresh) });
  });

  return router;
}

module.exports = { listingsRouter, listingView, loadPhotos, ownerInfo, ROOMS };
