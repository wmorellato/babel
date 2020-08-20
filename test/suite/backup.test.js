const fs = require('fs');
const os = require('os');
const path = require('path');
const sinon = require('sinon');
const { Manager } = require('../../src/manager');
const { BackupManager, CloudProviders, Period } = require('../../src/backup');
const { expect } = require('chai');
const rimraf = require('rimraf');
const { DriveClient } = require('../../src/cloud/drive');

sinon.stub(DriveClient.prototype, 'init').resolves({ token: 'foobar' });
sinon.stub(DriveClient.prototype, 'uploadFile').resolves();

suite('backup tests', function () {
  let storyId = '';
  const sandbox = sinon.createSandbox();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));
  const tempBackupDir = '/tmp/babel-backup/backup-subfolder/';
  const manager = new Manager(tempDir);

  const options = {
    providers: {
      cloud: [ CloudProviders.DRIVE ],
      local: tempBackupDir,
    },
    period: Period.DAILY * 365,
  };

  let backupManager = new BackupManager(manager.workspaceDirectory, manager.db);

  this.beforeAll(function () {
    manager.db.insertBackupEntry({
      timestamp: Date.now() - 3000,
      localPath: 'foo/bar',
      cloudProviders: ['drop'],
    });

    manager.db.insertBackupEntry({
      timestamp: Date.now() - 2000,
      localPath: 'foo/bar',
      cloudProviders: ['drop'],
    });
  });

  this.afterAll(function () {
    rimraf(tempDir, () => {});
    rimraf(tempBackupDir, () => {});
  });

  this.beforeEach(function () {
    sandbox.spy(backupManager);
  });

  this.afterEach(function () {
    sandbox.restore();
  });

  test('should init providers', async function () {
    await backupManager.init(options);

    expect(fs.existsSync(tempBackupDir)).to.be.equal(true);
    expect(backupManager.cloudProviders[0] instanceof DriveClient).to.be.equal(true);
  });

  test.skip('should do backup on initialization', async function () {
    manager.db.insertBackupEntry({
      timestamp: Date.now() - Period.DAILY * 2,
      localPath: 'foo/bar/foobar',
      cloudProviders: ['drive', 'dropbox'],
    });

    const backupManager2 = new BackupManager(manager.workspaceDirectory, manager.db);
    sandbox.spy(backupManager2);

    options.period = Period.DAILY;
    await backupManager2.init(options);

    expect(backupManager2.doBackup.calledOnce).to.be.equal(true);
  });

  test('should create full backup file', async function () {
    const options = { outputPath: '/home/wes/Documents' };
    const backupFilePath = await backupManager.createBackup(options);

    expect(fs.existsSync(backupFilePath)).to.be.equal(true);
  });

  test('should open backup file', async function () {    
    storyId = manager.createNewStory().story.id;
    const backupFilePath = await backupManager.createBackup({ outputPath: tempBackupDir });
    manager.removeStory(storyId, true);

    await backupManager.openBackup(backupFilePath);

    const storyDirectory = path.join(tempDir, storyId);
    expect(fs.lstatSync(storyDirectory).isDirectory()).to.be.equal(true);
    expect(fs.existsSync(path.join(storyDirectory, 'draft.md'))).to.be.equal(true);
  });
});