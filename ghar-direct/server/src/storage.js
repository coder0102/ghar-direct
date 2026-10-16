'use strict';

const fs = require('fs');
const path = require('path');

// Photo storage. "local" writes to a folder on the server. "s3" uses any S3-compatible bucket
// (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces).

function createLocalStorage(cfg) {
  const root = path.resolve(cfg.uploadDir);
  fs.mkdirSync(root, { recursive: true });
  return {
    kind: 'local',
    root,
    async put(key, buffer) {
      const file = path.join(root, key);
      if (!file.startsWith(root + path.sep)) throw new Error('bad key');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, buffer);
    },
    url(key) {
      return `${cfg.publicBaseUrl}/media/${key}`;
    },
    async remove(key) {
      const file = path.join(root, key);
      if (!file.startsWith(root + path.sep)) return;
      await fs.promises.rm(file, { force: true });
    },
  };
}

function createS3Storage(cfg) {
  let sdk;
  try {
    sdk = require('@aws-sdk/client-s3');
  } catch (e) {
    throw new Error('STORAGE=s3 needs the @aws-sdk/client-s3 package. Run: npm install');
  }
  const client = new sdk.S3Client({
    region: cfg.s3.region,
    endpoint: cfg.s3.endpoint || undefined,
    forcePathStyle: !!cfg.s3.endpoint,
    credentials: { accessKeyId: cfg.s3.accessKeyId, secretAccessKey: cfg.s3.secretAccessKey },
  });
  return {
    kind: 's3',
    async put(key, buffer, contentType) {
      await client.send(
        new sdk.PutObjectCommand({
          Bucket: cfg.s3.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );
    },
    url(key) {
      return `${cfg.s3.publicUrl}/${key}`;
    },
    async remove(key) {
      await client.send(new sdk.DeleteObjectCommand({ Bucket: cfg.s3.bucket, Key: key }));
    },
  };
}

function createStorage(cfg) {
  return cfg.storage === 's3' ? createS3Storage(cfg) : createLocalStorage(cfg);
}

module.exports = { createStorage, createLocalStorage };
