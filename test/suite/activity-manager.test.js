const fs = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf').sync;
const { expect } = require('chai');
const { BabelDb } = require('../../src/database');
const { Manager } = require('../../src/manager');
const { ActivityManager } = require('../../src/vscode/activity-manager');

suite.only('activity manager tests', function () {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));
  const manager = new Manager(tempDir);
  const db = new BabelDb(tempDir);
  let actManager = new ActivityManager(tempDir);

  let storyId = '123456';
  let versionObj = {
    storyId,
    name: 'new version',
    wordCount: 1000,
    created: Date.now(),
    statistics: {},
  };


  this.beforeAll(function () {
    db.drop();
    actManager.initDocument(versionObj);
  });

  this.afterAll(function () {
    rimraf(tempDir);
  });

  test('should get activity for story', function () {
    const act = actManager.getActivityForStory(versionObj.storyId);
  
    expect(act.sessionWordCount).to.be.equal(0);
  });

  test('should load activity from db', function () {
    db.insertActivityEntry({
      date: '2021-03-21',
      storyId: storyId,
      wordCount: 500,
    });

    actManager = new ActivityManager(tempDir);
    const act = actManager.getActivityForStory(versionObj.storyId);
  
    expect(act.sessionWordCount).to.be.equal(500);
  });

  test('should get diff word count', function () {
    versionObj.wordCount = 1500;
    actManager.updateActivity(versionObj);
    const act = actManager.getActivityForStory(versionObj.storyId);

    expect(act.sessionWordCount).to.be.equal(1000);
  });
});
