const path = require('path');
const fsExtra = require('fs-extra');
const config = require('../config/env');

function getUploadsBase() {
  const envBase = config.storage.uploadsDir && config.storage.uploadsDir.trim();
  if (envBase) {
    return path.resolve(__dirname, '..', envBase);
  }
  return path.resolve(__dirname, '../uploads');
}

function resolveUploadsPath(...segments) {
  return path.join(getUploadsBase(), ...segments);
}

async function ensureUploadsPath(...segments) {
  const target = resolveUploadsPath(...segments);
  await fsExtra.ensureDir(target);
  return target;
}

module.exports = {
  getUploadsBase,
  resolveUploadsPath,
  ensureUploadsPath
};
