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
const MOCK_FILE = path.join(TEMP_DIR, 'upload.bin');

const mock_token = {
  'access_token': '1/fFAGRNJru1FTz70BzhT3Zg',
  'refresh_token': '1//xEoDL4iW3cxlI7yDbSRFYNG01kVKM2C-259HOF2aQb',
};

const mock_token2 = {
  'access_token': 'RmFjZSBvZiBNZWxpbmRh',
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

suite('drive sync tests', function () {
  const sandbox = sinon.createSandbox();
  let driveClient;

  this.beforeAll(async function () {
    rimraf.sync(path.join(TEMP_DIR, '.token'));

    nock('https://oauth2.googleapis.com')
      .persist()
      .post('/token', undefined, {
        reqheaders: {'content-type': 'application/x-www-form-urlencoded'},
      })
      .reply(200, mock_token2);
    
    nock('https://www.googleapis.com')
      .persist()
      .post('/upload/drive/v3/files')
      .query(true)
      .reply(200, {});

    nock('https://www.googleapis.com')
      .persist()
      .patch('/upload/drive/v3/files/fakefileId')
      .query(true)
      .reply(200, {});

    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');

    // test for upload
    fs.writeFileSync(MOCK_FILE, 'The Waves Have Come');

    driveClient = new DriveClient();
    await driveClient.init();
  });

  this.beforeEach(function () {
    sandbox.spy(driveClient);
    sandbox.spy(driveClient.drive.files);
  });

  this.afterEach(function () {
    sandbox.restore();
  });

  test('should save token to file', async function () {
    await driveClient.saveTokens(mock_token);
    expect(fs.existsSync(path.join(TEMP_DIR, '.token'))).to.be.equal(true);
  });

  test('should load token from file', async function () {
    await driveClient.init();
    expect(driveClient.token).to.be.eql(mock_token);
  });

  test('should request new token when store is tampered', async function () {
    fs.writeFileSync(path.join(TEMP_DIR, '.token'), 'xxx');
    await driveClient.init();

    expect(driveClient.getAccessToken.calledOnce).to.be.equal(true);
  });

  test('should update file', async function () {
    nock('https://www.googleapis.com')
      .get('/drive/v3/files')
      .query(true)
      .reply(200, {
        'files': [{ id: 'fakefileId' }],
      });
    
    await driveClient.uploadFile(MOCK_FILE);
    expect(driveClient.drive.files.update.calledOnce).to.be.equal(true);
  });

  test('should create file', async function () {
    nock('https://www.googleapis.com')
      .get('/drive/v3/files')
      .query(true)
      .reply(200, {
        'files': [],
      });

    await driveClient.uploadFile(MOCK_FILE);
    expect(driveClient.drive.files.create.calledOnce).to.be.equal(true);
  });

  test.skip('should request new token when stored is expired', async function () {
    await driveClient.saveTokens(mock_token);
    expect(driveClient.getAccessToken.calledOnce).to.be.equal(true);
  });
});
