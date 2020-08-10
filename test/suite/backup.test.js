const fs = require('fs');
const os = require('os');
const path = require('path');
const { Backup } = require('../../src/backup');
const { expect } = require('chai');

suite.skip('backup tests', function () {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));
  let backup;

  this.beforeAll(function () {
    const options = {
      cloud: ['drive'],
      local: tempDir,
    };

    backup = new Backup(options);
  });

  test('should open backup file', function () {

  });

  test('should backup local files before overriding', function () {

  });

  test('should trigger backup', function () {

  });

  test('should trigger upload', function () {

  });
});