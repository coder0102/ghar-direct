'use strict';

function int(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

function loadConfig(env = process.env) {
  const cfg = {
    port: int(env.PORT, 8080),
    databaseUrl: env.DATABASE_URL || '',
    databaseSsl: env.DATABASE_SSL === 'true',
    jwtSecret: env.JWT_SECRET || '',
    adminToken: env.ADMIN_TOKEN || '',
    storage: env.STORAGE || 'local',
    uploadDir: env.UPLOAD_DIR || './uploads',
    publicBaseUrl: (env.PUBLIC_BASE_URL || 'http://localhost:8080').replace(/\/$/, ''),
    s3: {
      bucket: env.S3_BUCKET || '',
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT || '',
      accessKeyId: env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: env.S3_SECRET_ACCESS_KEY || '',
      publicUrl: (env.S3_PUBLIC_URL || '').replace(/\/$/, ''),
    },
    minPhotos: int(env.MIN_PHOTOS, 6),
    maxPhotos: int(env.MAX_PHOTOS, 10),
    maxPhotoDistanceM: int(env.MAX_PHOTO_DISTANCE_M, 150),
    nonceTtlMs: int(env.NONCE_TTL_MIN, 10) * 60 * 1000,
    idProvider: env.ID_PROVIDER || 'stub',
  };
  return cfg;
}

function validateConfig(cfg) {
  const problems = [];
  if (!cfg.databaseUrl) problems.push('DATABASE_URL is not set');
  if (!cfg.jwtSecret || cfg.jwtSecret === 'change-me' || cfg.jwtSecret.length < 24) {
    problems.push('JWT_SECRET must be a long random string (24+ characters)');
  }
  if (cfg.storage === 's3') {
    if (!cfg.s3.bucket || !cfg.s3.accessKeyId || !cfg.s3.secretAccessKey || !cfg.s3.publicUrl) {
      problems.push('STORAGE=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_URL');
    }
  }
  return problems;
}

module.exports = { loadConfig, validateConfig };
