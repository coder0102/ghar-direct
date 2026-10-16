'use strict';

// End-to-end test of the whole API against an in-memory Postgres (pg-mem).
// Run with: npm test

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { newDb } = require('pg-mem');

const { loadConfig } = require('../src/config');
const { migrate } = require('../src/schema');
const { createLocalStorage } = require('../src/storage');
const { getIdProvider } = require('../src/idverify');
const { createApp } = require('../src/app');

let server;
let base;
let uploadDir;
let testDb;
const ADMIN = 'test-admin-token';

// The flat sits here (Indiranagar, Bengaluru).
const FLAT = { lat: 12.9784, lng: 77.6408 };

before(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghar-test-'));
  const cfg = loadConfig({
    JWT_SECRET: 'test-secret-test-secret-test-secret',
    ADMIN_TOKEN: ADMIN,
    UPLOAD_DIR: uploadDir,
    PUBLIC_BASE_URL: 'http://test.local',
    DATABASE_URL: 'memory',
  });
  // By default the tests use an in-memory Postgres. Set TEST_DATABASE_URL to run them against a real
  // (empty, throwaway) Postgres database instead. That database is wiped at the start of the run.
  let db;
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = require('pg');
    db = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');
  } else {
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    db = new Pool();
  }
  testDb = db;
  await migrate(db);
  const app = createApp({ db, cfg, storage: createLocalStorage(cfg), idProvider: getIdProvider('stub'), rateLimits: false });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  if (testDb && process.env.TEST_DATABASE_URL) await testDb.end();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

async function call(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await fetch(base + url, { method, headers, body });
  let data = null;
  try { data = await res.json(); } catch (e) { /* not json */ }
  return { status: res.status, data };
}

async function register(name, email) {
  const r = await call('POST', '/auth/register', { json: { name, email, password: 'password123' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.token;
}

const fakePng = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);

async function takePhoto(token, listingId, o = {}) {
  let nonce = o.nonce;
  if (nonce === undefined) {
    const n = await call('POST', `/listings/${listingId}/photos/nonce`, { token });
    assert.equal(n.status, 200, JSON.stringify(n.data));
    nonce = n.data.nonce;
  }
  const form = new FormData();
  form.append('photo', new Blob([o.buf || fakePng()], { type: 'image/png' }), 'p.png');
  form.append('nonce', nonce);
  form.append('lat', String(o.lat === undefined ? FLAT.lat : o.lat));
  form.append('lng', String(o.lng === undefined ? FLAT.lng : o.lng));
  form.append('room', o.room || 'living');
  form.append('capturedAt', String(o.capturedAt === undefined ? Date.now() : o.capturedAt));
  return call('POST', `/listings/${listingId}/photos`, { token, form });
}

const listingInput = {
  type: 'flat', role: 'Owner', locality: 'Indiranagar', addressLine: '12th Main, house 14', lat: FLAT.lat, lng: FLAT.lng,
  bhk: 2, sqft: 1050, rent: 42000, deposit: '2.1 lakh', furnishing: 'Semi-furnished', floor: '2nd of 4',
  availableFrom: '1 Nov', nearby: 'Metro 700 m', tags: ['Balcony'],
};
const prompts = [
  { q: 'The best part of this house is', a: 'The balcony gets the first hour of sun every day.' },
  { q: 'Green flag about this flat', a: 'An owner who replies on WhatsApp the same evening.' },
  { q: 'Tiny red flag (we are honest)', a: 'The lift is slow and a little dramatic sometimes.' },
];

const state = {};

test('register, login, and profile', async () => {
  state.owner = await register('Meera Rao', 'meera@example.com');
  state.renter = await register('Sample Renter', 'renter@example.com');

  const dup = await call('POST', '/auth/register', { json: { name: 'X Y', email: 'meera@example.com', password: 'password123' } });
  assert.equal(dup.status, 409);
  const weak = await call('POST', '/auth/register', { json: { name: 'X Y', email: 'weak@example.com', password: 'short' } });
  assert.equal(weak.status, 400);
  const bad = await call('POST', '/auth/login', { json: { email: 'meera@example.com', password: 'wrong-password' } });
  assert.equal(bad.status, 401);
  const ok = await call('POST', '/auth/login', { json: { email: 'meera@example.com', password: 'password123' } });
  assert.equal(ok.status, 200);

  const noAuth = await call('GET', '/me');
  assert.equal(noAuth.status, 401);

  const put = await call('PUT', '/me', {
    token: state.renter,
    json: { profile: { work: 'Software engineer', budget: 28000, moveIn: '1 Nov', about: 'Quiet, cooks at home.' } },
  });
  assert.equal(put.status, 200);
  assert.equal(put.data.user.profile.work, 'Software engineer');
});

test('listing needs an ID check first', async () => {
  const r = await call('POST', '/listings', { token: state.owner, json: listingInput });
  assert.equal(r.status, 403);
  assert.equal(r.data.error, 'id_required');
  const v = await call('POST', '/me/verify-id', { token: state.owner, json: { docType: 'aadhaar' } });
  assert.equal(v.status, 200);
  assert.equal(v.data.user.idVerified, true);
});

test('create a draft listing', async () => {
  const wrongRole = await call('POST', '/listings', { token: state.owner, json: { ...listingInput, role: 'Flatmate host' } });
  assert.equal(wrongRole.status, 400);
  const r = await call('POST', '/listings', { token: state.owner, json: listingInput });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.listing.status, 'draft');
  assert.equal(r.data.listing.addressLine, '12th Main, house 14');
  state.listingId = r.data.listing.id;
});

test('photo verification rules', async () => {
  const id = state.listingId;

  // A photo with no valid code (for example picked from the gallery) is refused.
  const noNonce = await takePhoto(state.owner, id, { nonce: 'not-a-real-code-at-all-1234' });
  assert.equal(noNonce.status, 403);
  assert.equal(noNonce.data.error, 'bad_nonce');

  // Too far from the flat.
  const far = await takePhoto(state.owner, id, { lat: FLAT.lat + 0.01 });
  assert.equal(far.status, 403);
  assert.equal(far.data.error, 'too_far');

  // Taken before the camera was opened.
  const old = await takePhoto(state.owner, id, { capturedAt: Date.now() - 60 * 60 * 1000 });
  assert.equal(old.status, 403);
  assert.equal(old.data.error, 'photo_too_old');

  // Not an image.
  const n = await call('POST', `/listings/${id}/photos/nonce`, { token: state.owner });
  const form = new FormData();
  form.append('photo', new Blob([Buffer.from('this is not an image at all')], { type: 'image/png' }), 'x.png');
  form.append('nonce', n.data.nonce);
  form.append('lat', String(FLAT.lat));
  form.append('lng', String(FLAT.lng));
  form.append('room', 'living');
  form.append('capturedAt', String(Date.now()));
  const notImg = await call('POST', `/listings/${id}/photos`, { token: state.owner, form });
  assert.equal(notImg.status, 400);
  assert.equal(notImg.data.error, 'bad_image');

  // Someone else cannot add photos to this listing.
  const stranger = await call('POST', `/listings/${id}/photos/nonce`, { token: state.renter });
  assert.equal(stranger.status, 404);

  // A good photo, then the same bytes again (duplicate), then replaying the same code.
  const buf = fakePng();
  const nonce = (await call('POST', `/listings/${id}/photos/nonce`, { token: state.owner })).data.nonce;
  const good = await takePhoto(state.owner, id, { nonce, buf, room: 'living' });
  assert.equal(good.status, 201, JSON.stringify(good.data));
  assert.equal(good.data.count, 1);
  assert.equal(good.data.needed, 5);
  assert.match(good.data.photo.url, /^http:\/\/test\.local\/media\/listings\//);
  const dup = await takePhoto(state.owner, id, { buf });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error, 'duplicate_photo');
  const replay = await takePhoto(state.owner, id, { nonce });
  assert.equal(replay.status, 403);
  assert.equal(replay.data.error, 'nonce_used');

  // The saved file is served.
  const img = await fetch(good.data.photo.url.replace('http://test.local', base));
  assert.equal(img.status, 200);

  for (const room of ['balcony', 'bedroom', 'kitchen', 'bath']) {
    const r = await takePhoto(state.owner, id, { room });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
});

test('cannot publish with five photos or no prompts', async () => {
  const r = await call('POST', `/listings/${state.listingId}/publish`, { token: state.owner });
  assert.equal(r.status, 422);
  assert.ok(r.data.details.some((d) => /more verified photo/.test(d)));
  assert.ok(r.data.details.some((d) => /three prompts/i.test(d)));
});

test('publish with six photos and three prompts', async () => {
  const sixth = await takePhoto(state.owner, state.listingId, { room: 'exterior' });
  assert.equal(sixth.status, 201);
  assert.equal(sixth.data.needed, 0);

  const dupPrompts = await call('PATCH', `/listings/${state.listingId}`, {
    token: state.owner, json: { prompts: [prompts[0], prompts[0], prompts[1]] },
  });
  assert.equal(dupPrompts.status, 200);
  const bad = await call('POST', `/listings/${state.listingId}/publish`, { token: state.owner });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.details.some((d) => /different prompts/.test(d)));

  const moveLoc = await call('PATCH', `/listings/${state.listingId}`, { token: state.owner, json: { lat: FLAT.lat + 0.5 } });
  assert.equal(moveLoc.status, 409);
  assert.equal(moveLoc.data.error, 'location_locked');

  const patch = await call('PATCH', `/listings/${state.listingId}`, { token: state.owner, json: { prompts } });
  assert.equal(patch.status, 200);
  const pub = await call('POST', `/listings/${state.listingId}/publish`, { token: state.owner });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  assert.equal(pub.data.listing.status, 'published');
  assert.equal(pub.data.listing.photos.length, 6);

  const del = await call('DELETE', `/listings/${state.listingId}/photos/${pub.data.listing.photos[0].id}`, { token: state.owner });
  assert.equal(del.status, 409);
  assert.equal(del.data.error, 'min_photos');
});

test('feed hides the exact address and the owner\'s own listing', async () => {
  const mine = await call('GET', '/feed', { token: state.owner });
  assert.equal(mine.data.listings.length, 0);

  const feed = await call('GET', `/feed?lat=${FLAT.lat + 0.02}&lng=${FLAT.lng}&maxRent=50000&type=flat`, { token: state.renter });
  assert.equal(feed.status, 200);
  assert.equal(feed.data.listings.length, 1);
  const l = feed.data.listings[0];
  assert.equal(l.owner.name, 'Meera R.');
  assert.equal(l.owner.idVerified, true);
  assert.equal(l.addressLine, undefined);
  assert.equal(l.lat, undefined);
  assert.equal(l.photos.length, 6);
  assert.equal(l.prompts.length, 3);
  assert.ok(l.distanceKm > 1 && l.distanceKm < 4);

  const tooCheap = await call('GET', '/feed?maxRent=20000', { token: state.renter });
  assert.equal(tooCheap.data.listings.length, 0);
  const wrongType = await call('GET', '/feed?type=flatmate', { token: state.renter });
  assert.equal(wrongType.data.listings.length, 0);
  const far = await call('GET', `/feed?lat=${FLAT.lat + 1}&lng=${FLAT.lng}&radiusKm=10`, { token: state.renter });
  assert.equal(far.data.listings.length, 0);
});

test('like a specific answer, owner replies, chat opens', async () => {
  const id = state.listingId;
  const like = await call('POST', `/listings/${id}/like`, {
    token: state.renter, json: { targetType: 'prompt', targetIndex: 0, comment: 'Chai on that balcony sounds perfect.' },
  });
  assert.equal(like.status, 201, JSON.stringify(like.data));
  assert.equal(like.data.status, 'pending');
  state.convId = like.data.conversationId;

  const again = await call('POST', `/listings/${id}/like`, { token: state.renter, json: {} });
  assert.equal(again.status, 409);
  assert.equal(again.data.error, 'already_sent');
  const more = await call('POST', `/conversations/${state.convId}/messages`, { token: state.renter, json: { body: 'hello??' } });
  assert.equal(more.status, 409);
  assert.equal(more.data.error, 'wait_for_reply');

  const feed = await call('GET', '/feed', { token: state.renter });
  assert.equal(feed.data.listings.length, 0, 'a liked listing leaves the feed');

  const ownerList = await call('GET', '/conversations', { token: state.owner });
  assert.equal(ownerList.data.conversations.length, 1);
  const c = ownerList.data.conversations[0];
  assert.equal(c.status, 'pending');
  assert.equal(c.unread, 1);
  assert.equal(c.iAm, 'owner');

  const detail = await call('GET', `/conversations/${state.convId}`, { token: state.owner });
  assert.equal(detail.data.conversation.other.profile.work, 'Software engineer');
  const renterView = await call('GET', `/conversations/${state.convId}`, { token: state.renter });
  assert.equal(renterView.data.conversation.listing.addressLine, undefined, 'address stays hidden until accepted');

  const msgs = await call('GET', `/conversations/${state.convId}/messages`, { token: state.owner });
  assert.equal(msgs.data.messages.length, 1);
  assert.equal(msgs.data.messages[0].quote.label, 'The best part of this house is');
  assert.equal(msgs.data.messages[0].body, 'Chai on that balcony sounds perfect.');
  const afterRead = await call('GET', '/conversations', { token: state.owner });
  assert.equal(afterRead.data.conversations[0].unread, 0);

  const reply = await call('POST', `/conversations/${state.convId}/messages`, { token: state.owner, json: { body: 'Thanks! Want to visit Saturday?' } });
  assert.equal(reply.status, 201);
  assert.equal(reply.data.status, 'open');

  const opened = await call('GET', `/conversations/${state.convId}`, { token: state.renter });
  assert.equal(opened.data.conversation.status, 'open');
  assert.equal(opened.data.conversation.listing.addressLine, '12th Main, house 14');

  const first = msgs.data.messages[0].id;
  const poll = await call('GET', `/conversations/${state.convId}/messages?after=${first}`, { token: state.renter });
  assert.equal(poll.data.messages.length, 1);
  assert.equal(poll.data.messages[0].mine, false);

  const send = await call('POST', `/conversations/${state.convId}/messages`, { token: state.renter, json: { body: 'Saturday 11 works.' } });
  assert.equal(send.status, 201);

  const outsider = await register('Nosy Parker', 'nosy@example.com');
  const peek = await call('GET', `/conversations/${state.convId}/messages`, { token: outsider });
  assert.equal(peek.status, 404);
});

test('pass removes a listing from the feed', async () => {
  const other = await register('Pass Person', 'pass@example.com');
  assert.equal((await call('GET', '/feed', { token: other })).data.listings.length, 1);
  assert.equal((await call('POST', `/listings/${state.listingId}/pass`, { token: other })).status, 200);
  assert.equal((await call('GET', '/feed', { token: other })).data.listings.length, 0);
});

test('report and block closes the chat and hides the listing', async () => {
  const rep = await call('POST', '/reports', {
    token: state.renter, json: { conversationId: state.convId, reason: 'broker', details: 'Asked me to pay a fee', block: true },
  });
  assert.equal(rep.status, 201);
  assert.equal(rep.data.blocked, true);

  const send = await call('POST', `/conversations/${state.convId}/messages`, { token: state.renter, json: { body: 'hi' } });
  assert.equal(send.status, 403);
  const list = await call('GET', '/conversations', { token: state.renter });
  assert.equal(list.data.conversations.length, 0);
  const ownerSend = await call('POST', `/conversations/${state.convId}/messages`, { token: state.owner, json: { body: 'hello' } });
  assert.equal(ownerSend.status, 403);

  const noTarget = await call('POST', '/reports', { token: state.renter, json: { reason: 'other' } });
  assert.equal(noTarget.status, 400);
});

test('three different reporters hide the listing for review, admin can restore it', async () => {
  const r2 = await register('Reporter Two', 'r2@example.com');
  const r3 = await register('Reporter Three', 'r3@example.com');
  const a = await call('POST', '/reports', { token: r2, json: { listingId: state.listingId, reason: 'fake_listing' } });
  assert.equal(a.status, 201);
  const mid = await call('GET', '/listings/mine', { token: state.owner });
  assert.equal(mid.data.listings[0].status, 'published', 'two reports are not enough');
  const b = await call('POST', '/reports', { token: r3, json: { listingId: state.listingId, reason: 'fake_listing', details: 'Photos look stock' } });
  assert.equal(b.status, 201);

  const mine = await call('GET', '/listings/mine', { token: state.owner });
  assert.equal(mine.data.listings[0].status, 'under_review');
  const fresh = await register('Fresh Eyes', 'fresh@example.com');
  assert.equal((await call('GET', '/feed', { token: fresh })).data.listings.length, 0);

  // Admin
  const noToken = await call('GET', '/admin/api/reports');
  assert.equal(noToken.status, 401);
  const wrong = await fetch(base + '/admin/api/reports', { headers: { 'x-admin-token': 'nope' } });
  assert.equal(wrong.status, 401);
  const listRes = await fetch(base + '/admin/api/reports', { headers: { 'x-admin-token': ADMIN } });
  const list = await listRes.json();
  assert.equal(list.reports.length, 3);
  assert.equal(list.reports[0].target.name, 'Meera Rao');

  const page = await fetch(base + '/admin');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Reports/);

  const resolve = async (id, action) =>
    (await fetch(`${base}/admin/api/reports/${id}/resolve`, {
      method: 'POST', headers: { 'x-admin-token': ADMIN, 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    })).json();
  const restored = await resolve(list.reports[0].id, 'restore_listing');
  assert.equal(restored.status, 'dismissed');
  const back = await call('GET', '/listings/mine', { token: state.owner });
  assert.equal(back.data.listings[0].status, 'published');
  assert.equal((await call('GET', '/feed', { token: fresh })).data.listings.length, 1);

  const banned = await resolve(list.reports[1].id, 'ban_user');
  assert.equal(banned.status, 'actioned');
  const login = await call('POST', '/auth/login', { json: { email: 'meera@example.com', password: 'password123' } });
  assert.equal(login.status, 403);
  const old = await call('GET', '/me', { token: state.owner });
  assert.equal(old.status, 403);
  assert.equal((await call('GET', '/feed', { token: fresh })).data.listings.length, 0);
});

test('flatmate listing type validates its own roles', async () => {
  const host = await register('Sana Khan', 'sana@example.com');
  await call('POST', '/me/verify-id', { token: host, json: {} });
  const bad = await call('POST', '/listings', { token: host, json: { ...listingInput, type: 'flatmate', role: 'Owner' } });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/listings', {
    token: host,
    json: { ...listingInput, type: 'flatmate', role: 'Flatmate host', roomType: 'Private room', alreadyLiving: 2, rent: 17500 },
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.listing.type, 'flatmate');
  assert.equal(ok.data.listing.alreadyLiving, 2);
});

test('delete account', async () => {
  const tmp = await register('Temp User', 'temp@example.com');
  const del = await call('DELETE', '/me', { token: tmp });
  assert.equal(del.status, 200);
  const after = await call('GET', '/me', { token: tmp });
  assert.equal(after.status, 401);
});
