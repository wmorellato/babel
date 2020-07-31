const os = require('os');
const fs = require('fs');
const http = require('http');
const path = require('path');
const nock = require('nock');
const sinon = require('sinon');
const vscode = require('vscode');
const rimraf = require('rimraf');
const { expect } = require('chai');

const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));

const mock_token = {
  'access_token': '1/fFAGRNJru1FTz70BzhT3Zg',
  'expires_in': 1313131313,
  'token_type': 'Bearer',
  'scope': 'https://www.googleapis.com/auth/drive.metadata.readonly',
  'refresh_token': '1//xEoDL4iW3cxlI7yDbSRFYNG01kVKM2C-259HOF2aQb',
};

const mock_token2 = {
  'access_token': 'RmFjZSBvZiBNZWxpbmRh',
  'expires_in': 1313131313,
  'token_type': 'Bearer',
  'scope': 'https://www.googleapis.com/auth/drive.metadata.readonly',
  'refresh_token': '1//xEoDL4iW3cxlI7yDbSRFYNG01kVKM2C-259HOF2aQb',
};

sinon.stub(vscode.workspace, 'workspaceFolders').value([{uri: vscode.Uri.file(TEMP_DIR)}])

delete require.cache[require.resolve('../../src/cloud/drive')];
require.cache[require.resolve('open')] = {
  exports: () => {
    http.get('http://127.0.0.1:13130/oauth2callback?code=anewcode').end();
    return Promise.resolve({ unref() {} });
  },
};

const { DriveClient } = require('../../src/cloud/drive');

suite.only('drive sync tests', function () {
  let driveClient;

  this.beforeAll(async function () {
    rimraf.sync(path.join(TEMP_DIR, '.token'));

    nock('https://oauth2.googleapis.com')
      .persist()
      .post('/token', undefined, {
        reqheaders: {'content-type': 'application/x-www-form-urlencoded'},
      })
      .reply(200, mock_token2);

    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    driveClient = new DriveClient();
  });

  test('should save token to file', async function () {
    await driveClient.saveTokens(mock_token);
    expect(fs.existsSync(path.join(TEMP_DIR, '.token'))).to.be.equal(true);
  });

  test('should load token from file', async function () {
    await driveClient.init();
    expect(driveClient.token).to.be.eql(mock_token);
  });

  test.skip('should request new token when store is tampered', async function () {
    fs.writeFileSync(path.join(TEMP_DIR, '.token'), 'xxx');
    await driveClient.init();

    expect(driveClient.token).to.be.eql(mock_token2);
  });

  test('should request new token when stored is expired', function () {

  });
});
