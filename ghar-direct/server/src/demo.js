'use strict';

// Zero-setup demo: runs the whole server on an in-memory database and fills it with sample flats,
// so you can open the app on your phone and swipe straight away. Everything is erased when you stop it.
//
//   npm run demo
//
// Do not use this for a real launch. For that, see the README ("Go live").

const os = require('os');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { newDb } = require('pg-mem');
const { loadConfig } = require('./config');
const { migrate } = require('./schema');
const { createLocalStorage } = require('./storage');
const { getIdProvider } = require('./idverify');
const { createApp } = require('./app');

const PASSWORD = 'demo-pass-123';

/* ---------- tiny PNG maker, so demo photos need no image library ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const W = 600;
const H = 690;
const PALETTES = [
  ['#EADFCF', '#B98E64', '#3E7C6B', '#CDE6F0'],
  ['#DCE6EC', '#9C8B7A', '#C86B4F', '#F6E3B4'],
  ['#E6E0EE', '#8C7A69', '#2F5D8C', '#D7ECE4'],
  ['#E4EBD9', '#A78B65', '#B5524A', '#D6E8F2'],
  ['#F0E4DA', '#8E7C70', '#40695A', '#E5EEF6'],
];

// A simple flat-colour scene: wall, floor, a window and a piece of furniture. Different for every photo.
function roomPng(seed, room) {
  const p = PALETTES[seed % PALETTES.length].map(hex);
  const [wall, floor, accent, glass] = p;
  const px = Buffer.alloc(W * H * 3);
  const rect = (x, y, w, h, col) => {
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) {
        const o = (j * W + i) * 3;
        px[o] = col[0];
        px[o + 1] = col[1];
        px[o + 2] = col[2];
      }
    }
  };
  rect(0, 0, W, H, wall);
  rect(0, 450, W, H - 450, floor);
  const r = seed * 37; // moves things around a little between photos
  if (room === 'balcony' || room === 'terrace' || room === 'exterior') {
    rect(0, 0, W, 450, glass);
    rect(0, 400, W, 60, [110, 90, 70]);
    for (let i = 0; i < 20; i++) rect(10 + i * 30, 300, 8, 110, [60, 60, 60]);
    rect(0, 292, W, 12, [60, 60, 60]);
    rect(60 + (r % 80), 500, 120, 90, accent);
  } else {
    rect(60 + (r % 40), 90, 200, 260, glass);
    rect(155 + (r % 40), 90, 10, 260, [255, 255, 255]);
    rect(60 + (r % 40), 215, 200, 10, [255, 255, 255]);
    rect(280, 370 + (r % 20), 270, 110, accent);
    rect(270, 410 + (r % 20), 40, 90, accent);
    rect(530, 410 + (r % 20), 40, 90, accent);
  }
  // A small colour stripe from the seed keeps every file's bytes different (the server rejects duplicate photos).
  rect(0, H - 6, W, 6, [(floor[0] + seed * 3) % 256, (floor[1] + seed * 5) % 256, (floor[2] + seed * 7) % 256]);

  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- sample data ---------- */
const DEMO = [
  { owner: 'Meera Rao', email: 'meera@demo.test', type: 'flat', role: 'Owner', locality: 'Indiranagar', address: '12th Main, off CMH Road', lat: 12.9784, lng: 77.6408, bhk: 2, sqft: 1050, rent: 42000, deposit: '₹2.1 lakh', furnishing: 'Semi-furnished', floor: '2nd of 4', avail: '1 Nov', nearby: 'Indiranagar metro, 700 m on foot', tags: ['Balcony', 'Parking', 'Pets OK'],
    prompts: [['The best part of this house is', 'The balcony gets the first hour of sun. Chai out there beats any cafe in Indiranagar.'], ['Green flag about this flat', 'An owner who replies on WhatsApp at 9 pm and fixes the geyser the same day.'], ['Tiny red flag (we are honest)', 'The lift is slow and a little dramatic. The stairs are free cardio.']],
    rooms: ['living', 'balcony', 'bedroom', 'kitchen', 'bath', 'exterior'] },
  { owner: 'Sana Khan', email: 'sana@demo.test', type: 'flatmate', role: 'Flatmate host', locality: 'Koramangala', address: '6th Block, near Jyoti Nivas', lat: 12.9352, lng: 77.6245, bhk: 3, sqft: 1400, rent: 17500, deposit: '₹52,500', furnishing: 'Furnished room', floor: '3rd of 5', avail: '1 Nov', roomType: 'Private room, attached bath', already: 2, nearby: 'Koramangala 5th Block cafes, 8 minutes on foot', tags: ['Night owl', 'WFH', 'Plant parent', 'Cooks a lot'],
    prompts: [['My living style', 'Tidy kitchen, messy desk. Two designers and one very loud monstera.'], ['Ideal flatmate energy', 'Respects a closed door, joins movie night when invited, never eats the last paratha.'], ['Dealbreakers', 'Loud calls after midnight and pans left unwashed overnight.']],
    rooms: ['living', 'bedroom', 'kitchen', 'balcony', 'desk', 'bath'] },
  { owner: 'Karthik Nair', email: 'karthik@demo.test', type: 'flat', role: 'Moving-out tenant', locality: 'HSR Layout', address: 'Sector 2, near 27th Main', lat: 12.9116, lng: 77.6474, bhk: 1, sqft: 620, rent: 23500, deposit: '₹70,000', furnishing: 'Fully furnished', floor: '1st of 3', avail: '20 Nov', nearby: 'Sector 2 market, 5 minutes on foot', tags: ['Furnished', 'Power backup'],
    prompts: [['The best part of this house is', 'Corner flat with windows on two sides. You wake up to birds, not horns.'], ['Rent hack', 'The fibre plan is paid till December. Take it over and skip the setup fee.'], ['Why I am leaving', 'Pune job. Lease runs to Aug 2027, the owner agreed to a handover and I will introduce you.']],
    rooms: ['living', 'bedroom', 'kitchen', 'desk', 'balcony', 'bath'] },
  { owner: 'Dr. S. Iyer', email: 'iyer@demo.test', type: 'flat', role: 'Owner', locality: 'Koramangala', address: '5th Block, 80 Feet Road', lat: 12.9345, lng: 77.6190, bhk: 3, sqft: 1620, rent: 68000, deposit: '₹3.4 lakh', furnishing: 'Unfurnished', floor: 'Ground floor with garden', avail: '1 Dec', nearby: 'Sony World signal, 10 minutes by auto', tags: ['Garden', 'Parking', 'Pets OK'],
    prompts: [['The best part of this house is', 'A private garden with a mango tree. Kids and dogs play outside while you cook.'], ['The neighbours are', 'The owner lives upstairs and plays old Kishore Kumar at 7 am. You get used to it, then you miss it.'], ['Green flag about this flat', 'Two-car parking and a fenced garden, so toddlers and golden retrievers are both safe.']],
    rooms: ['exterior', 'living', 'kitchen', 'bedroom', 'desk', 'bath'] },
  { owner: 'Rohan Pillai', email: 'rohan@demo.test', type: 'flatmate', role: 'Flatmate host', locality: 'HSR Layout', address: 'Sector 6, near the Agara lake road', lat: 12.9121, lng: 77.6446, bhk: 2, sqft: 980, rent: 14000, deposit: '₹42,000', furnishing: 'Furnished room', floor: '2nd of 4', avail: '25 Oct', roomType: 'Private room, shared bath', already: 1, nearby: 'Agara lake walking track, 6 minutes on foot', tags: ['Early bird', 'Gym rat', 'Quiet', 'Pets OK'],
    prompts: [['A typical weeknight at ours', 'Dal rice, one episode, lights off by 11. The weekends are the wild part.'], ['Kitchen rules', 'Label your oat milk. Anything unlabelled is community property.'], ['Green flag about our place', 'A gym, a park and two serious biryani places, all walkable.']],
    rooms: ['bedroom', 'living', 'kitchen', 'balcony', 'exterior', 'bath'] },
  { owner: 'Venkat Prasad', email: 'venkat@demo.test', type: 'flat', role: 'Owner', locality: 'Jayanagar', address: '4th T Block, near Cool Joint', lat: 12.9250, lng: 77.5938, bhk: 2, sqft: 1100, rent: 35000, deposit: '₹2 lakh', furnishing: 'Unfurnished', floor: 'Top floor of 3', avail: '15 Nov', nearby: 'Jayanagar 4th Block complex, 6 minutes on foot', tags: ['Terrace', 'Pets OK'],
    prompts: [['The best part of this house is', 'Terrace access shared with one other family. Evenings up there are undefeated.'], ['The neighbours are', 'One quiet family, the owner downstairs, and a very judgy cat.'], ['You will love the area because', 'The 4th Block complex is six minutes away: filter coffee, bookshops and a dosa worth fighting for.']],
    rooms: ['living', 'terrace', 'bedroom', 'kitchen', 'bath', 'exterior'] },
];

async function seed(db, storage) {
  const hash = bcrypt.hashSync(PASSWORD, 8);
  const now = Date.now();
  let seedNo = 0;
  for (const [n, d] of DEMO.entries()) {
    const userId = crypto.randomUUID();
    const listingId = crypto.randomUUID();
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, id_status, id_verified_at, created_at) VALUES ($1,$2,$3,$4,'verified',$5,$5)`,
      [userId, d.email, hash, d.owner, now]
    );
    await db.query(
      `INSERT INTO listings (id, owner_id, type, role, status, locality, address_line, lat, lng, bhk, sqft, rent, deposit, furnishing, floor,
         available_from, room_type, already_living, nearby, tags, prompts, created_at, updated_at, published_at)
       VALUES ($1,$2,$3,$4,'published',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21,$21)`,
      [listingId, userId, d.type, d.role, d.locality, d.address, d.lat, d.lng, d.bhk, d.sqft, d.rent, d.deposit, d.furnishing, d.floor,
       d.avail, d.roomType || '', d.already || 0, d.nearby, JSON.stringify(d.tags),
       JSON.stringify(d.prompts.map(([q, a]) => ({ q, a }))), now - n * 60000]
    );
    for (const [i, room] of d.rooms.entries()) {
      const png = roomPng(seedNo++ + n, room);
      const key = `demo/${listingId}/${i}.png`;
      await storage.put(key, png);
      await db.query(
        `INSERT INTO photos (id, listing_id, room, storage_key, sha256, lat, lng, distance_m, captured_at, position, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$8)`,
        [crypto.randomUUID(), listingId, room, key, crypto.createHash('sha256').update(png).digest('hex'), d.lat, d.lng, now - 86400000, i]
      );
    }
  }
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}

async function main() {
  const port = parseInt(process.env.PORT || '8080', 10);
  const host = process.env.DEMO_HOST || lanAddress();
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghar-demo-'));
  const cfg = loadConfig({
    PORT: String(port),
    JWT_SECRET: 'demo-secret-demo-secret-demo-secret',
    ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'demo-admin',
    UPLOAD_DIR: uploadDir,
    PUBLIC_BASE_URL: `http://${host}:${port}`,
    DATABASE_URL: 'memory',
    // Generous in the demo so a phone testing from indoors does not get refused by the location check.
    MAX_PHOTO_DISTANCE_M: process.env.MAX_PHOTO_DISTANCE_M || '150',
  });
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = new Pool();
  await migrate(db);
  const storage = createLocalStorage(cfg);
  await seed(db, storage);
  const app = createApp({ db, cfg, storage, idProvider: getIdProvider('stub') });
  app.listen(port, '0.0.0.0', () => {
    console.log('\nGhar Direct demo server is running (data is erased when you stop it).\n');
    console.log(`  Server:        http://${host}:${port}`);
    console.log(`  Admin page:    http://${host}:${port}/admin   (token: ${cfg.adminToken})`);
    console.log(`  Sample owners: ${DEMO.map((d) => d.email).join(', ')}  password: ${PASSWORD}`);
    console.log('\nIn the app folder, create a file named .env containing:');
    console.log(`  EXPO_PUBLIC_API_URL=http://${host}:${port}\n`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
