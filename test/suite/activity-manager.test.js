const fs = require('fs');
const os = require('os');
const path = require('path');
const moment = require('moment');
const rimraf = require('rimraf').sync;
const { expect } = require('chai');
const { BabelDb } = require('../../src/database');
const { Manager } = require('../../src/manager');
const { ActivityManager } = require('../../src/vscode/activity-manager');

suite('activity manager tests', function () {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));
  const manager = new Manager(tempDir);
  const db = new BabelDb(tempDir);
  let actManager = new ActivityManager(tempDir);

  const storyObj = manager.createNewStory('new story');
  const versionObj = storyObj.version;
  versionObj.wordCount = 1000;

  this.beforeAll(function () {
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
      date: moment().format('YYYY-MM-DD'),
      storyId: versionObj.storyId,
      wordCount: 500,
      initialWordCount: versionObj.wordCount,
    });

    actManager = new ActivityManager(tempDir);
    const act = actManager.getActivityForStory(versionObj.storyId);
  
    expect(act.sessionWordCount).to.be.equal(500);
  });

  test('should get diff word count', function () {
    versionObj.wordCount = 1750;
    actManager.updateActivity(versionObj);
    const act = actManager.getActivityForStory(versionObj.storyId);

    expect(act.sessionWordCount).to.be.equal(750);
  });

  test('save activity to database', function () {
    actManager.saveStoryActivity(versionObj);

    const act = db.getActivityForDate(moment().format('YYYY-MM-DD'));
    expect(act.entries).to.be.eql([{
      storyId: versionObj.storyId,
      wordCount: 750,
      initialWordCount: 1000,
    }])
  })
});
