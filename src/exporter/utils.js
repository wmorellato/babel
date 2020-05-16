const crypto = require('crypto');

function getRandomParaId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

module.exports = {
  getRandomParaId,
};
