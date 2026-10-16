'use strict';

// Times are stored as epoch milliseconds (BIGINT). JSON-ish fields are stored as TEXT.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    id_status TEXT NOT NULL DEFAULT 'none',
    id_verified_at BIGINT,
    profile TEXT NOT NULL DEFAULT '{}',
    banned INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    type TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    locality TEXT NOT NULL,
    address_line TEXT NOT NULL DEFAULT '',
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    bhk INTEGER NOT NULL,
    sqft INTEGER NOT NULL DEFAULT 0,
    rent INTEGER NOT NULL,
    deposit TEXT NOT NULL DEFAULT '',
    furnishing TEXT NOT NULL DEFAULT '',
    floor TEXT NOT NULL DEFAULT '',
    available_from TEXT NOT NULL DEFAULT '',
    room_type TEXT NOT NULL DEFAULT '',
    already_living INTEGER NOT NULL DEFAULT 0,
    nearby TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    prompts TEXT NOT NULL DEFAULT '[]',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    published_at BIGINT
  )`,
  `CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status)`,
  `CREATE INDEX IF NOT EXISTS listings_owner_idx ON listings (owner_id)`,
  `CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    room TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    distance_m INTEGER NOT NULL,
    captured_at BIGINT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS photos_listing_idx ON photos (listing_id)`,
  `CREATE TABLE IF NOT EXISTS photo_nonces (
    nonce TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    issued_at BIGINT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS swipes (
    user_id TEXT NOT NULL,
    listing_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, listing_id)
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    renter_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    renter_last_read BIGINT NOT NULL DEFAULT 0,
    owner_last_read BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS conversations_renter_idx ON conversations (renter_id)`,
  `CREATE INDEX IF NOT EXISTS conversations_owner_idx ON conversations (owner_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    body TEXT NOT NULL,
    quote TEXT,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (conversation_id)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    listing_id TEXT,
    conversation_id TEXT,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  )`,
];

async function migrate(db) {
  for (const sql of STATEMENTS) {
    await db.query(sql);
  }
}

module.exports = { migrate, STATEMENTS };
