
const crypto = require('crypto');

const attr = {
  ALGORITHM: 'aes-256-gcm',
  IV_SIZE: 16,
  TAG_SIZE: 16,
  KEY_SIZE: 32,
  SALT_SIZE: 64,
  KDF_ITERATIONS: 10000,
};

/**
 * 
 * @param {Buffer} buff 
 * @param {number} start 
 * @param {number} len 
 */
function slice(buff, start, len) {
  if (len) {
    return buff.slice(start, start + len);
  }

  return buff.slice(start);
}

function encrypt(text, password) {
  return new Promise((resolve, reject) => {
    try {
      const salt = crypto.randomBytes(attr.SALT_SIZE);
      const key = crypto.pbkdf2Sync(password, salt, attr.KDF_ITERATIONS, attr.KEY_SIZE, 'sha512');

      const iv = crypto.randomBytes(attr.IV_SIZE);
      const cipher = crypto.createCipheriv(attr.ALGORITHM, key, iv);

      const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      resolve(Buffer.concat([salt, iv, tag, ct]));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * asdf
 * @param {Buffer} enc_data encrypted data
 * @param {String} password password
 * @returns {Promise<Buffer>} buffer with encrypted data
 */
function decrypt(enc_data, password) {
  return new Promise((resolve) => {
    const salt = slice(enc_data, 0, attr.SALT_SIZE);
    const iv = slice(enc_data, attr.SALT_SIZE, attr.IV_SIZE);
    const tag = slice(enc_data, attr.IV_SIZE + attr.SALT_SIZE, attr.TAG_SIZE);
    const ct = slice(enc_data, attr.IV_SIZE + attr.SALT_SIZE + attr.TAG_SIZE);

    const key = crypto.pbkdf2Sync(password, salt, attr.KDF_ITERATIONS, attr.KEY_SIZE, 'sha512');
    const decipher = crypto.createDecipheriv(attr.ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const pt = Buffer.concat([decipher.update(ct, 'utf8'), decipher.final()]);

    resolve(pt);
  });
}

module.exports = {
  encrypt,
  decrypt,
};
