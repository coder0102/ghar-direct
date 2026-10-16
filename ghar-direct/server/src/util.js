'use strict';

const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const uid = () => crypto.randomUUID();
const num = (v) => (v === null || v === undefined ? null : Number(v));

function safeJson(s, fallback) {
  try {
    const v = JSON.parse(s);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

// "Meera Rao" -> "Meera R." so full names are never exposed to strangers.
function displayName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Someone';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

// Builds "$1,$2,$3" for IN (...) lists. Works on every Postgres version and on pg-mem.
function placeholders(count, start = 1) {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(',');
}

// Returns parsed data, or throws a 400 listing every problem.
function parse(schema, data) {
  const r = schema.safeParse(data === undefined ? {} : data);
  if (!r.success) {
    const details = r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
    const err = new HttpError(400, 'invalid_input', details[0]);
    err.details = details;
    throw err;
  }
  return r.data;
}

const ROOM_LABELS = {
  living: 'Living room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  balcony: 'Balcony',
  exterior: 'The building',
  bath: 'Bathroom',
  desk: 'Work nook',
  terrace: 'Terrace',
  other: 'Other',
};

module.exports = { HttpError, uid, num, safeJson, displayName, firstName, placeholders, parse, ROOM_LABELS };
