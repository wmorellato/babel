const fs = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf').sync;
const { expect } = require('chai');
const {
  storyA,
  storyB,
  storyADraft,
  storyBDraft,
  storyBRevision,
} = require('../fixtures/storyObjects');
const { BabelDb } = require('../../src/database');
const { STORY_NOT_FOUND } = require('../../src/errors');

suite.only('database tests', function () {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));
  const db = new BabelDb(tempDir);

  this.beforeAll(function () {
    db.drop();

    db.insertStory(storyA);
    db.insertStory(storyB);

    let vid = undefined;
    vid = db.insertVersion(storyA.id, storyADraft);
    storyA.versions.push(vid.id);

    vid = db.insertVersion(storyB.id, storyBRevision);
    storyB.versions.push(vid.id);

    vid = db.insertVersion(storyB.id, storyBDraft);
    storyB.versions.push(vid.id);
  });

  this.afterAll(function () {
    rimraf(tempDir);
  });

  test('should get all stories sorted by creation date', function () {
    const stories = db.getAllStories('created');

    expect(stories[0].title).to.be.eql('The Creation of a Firefly');
    expect(stories[1].title).to.be.eql('Hearts and Daggers');
  });

  test('should get all stories sorted by title', function () {
    const stories = db.getAllStories('title');
    
    expect(stories[0].title).to.be.eql('Hearts and Daggers');
    expect(stories[1].title).to.be.eql('The Creation of a Firefly');
  });

  test('should get story by id', function () {
    const storyObj = db.getStoryById(storyA.id);

    expect(storyObj).to.be.eql(storyA);
  });

  test('should get version by id', function () {
    const versionObj = db.getVersionById(storyADraft.id);

    expect(versionObj).to.be.eql(storyADraft);
  });

  test('should get all versions by story id', function () {
    const versions = db.getVersionsByStory(storyB.id);

    expect(versions[0]).to.be.eql(storyBRevision);
    expect(versions[1]).to.be.eql(storyBDraft);
  });

  test('should insert new version', function () {
    const versionObj = {
      id: 'dfa2bffb-ea9c-437a-b71d-e690c10a8b45',
      name: 'newVersion',
      wordCount: 0,
      created: Date.now(),
      statistics: {},
    };

    db.insertVersion(storyA.id, versionObj);
    const storyObj = db.getStoryById(storyA.id);
    const versionDbObj = db.getVersionById(versionObj.id);

    expect(storyObj.versions).to.contain(versionObj.id);
    expect(versionDbObj).to.be.eql(versionObj);
  });

  test('should fail to insert version for non-existent story', function () {
    expect(() => {
      db.insertVersion('fakeid', storyADraft);
    }).to.throw(STORY_NOT_FOUND);
  });

  test('should update version info', function () {
    const versionObj = { ...storyBDraft };
    versionObj.wordCount = 5000;
    versionObj.modified = Date.now();
    versionObj.statistics = {
      nouns: 100,
      adverbs: 100,
    };

    db.updateVersionInfo(versionObj);
    const dbVersionObj = db.getVersionById(versionObj.id);

    expect(dbVersionObj).to.be.eql(versionObj);
  });

  test('should delete version', function () {
    let storyObj = db.getStoryById(storyB.id);
    let versionObj = db.getVersionById(storyBDraft.id);

    expect(storyObj.versions).to.contain(storyBDraft.id);
    expect(versionObj).not.to.be.equal(undefined);

    db.deleteVersion(storyB.id, storyBDraft.id);

    storyObj = db.getStoryById(storyB.id);
    versionObj = db.getVersionById(storyBDraft.id);

    expect(storyObj.versions).not.to.contain(storyBDraft.id);
    expect(versionObj).to.be.equal(undefined);
  });

  test('should delete story', function () {    
    const newVersionA = { ...storyADraft };
    newVersionA.id = 'df4df4df4df4df4df4df4df4';
    newVersionA.storyId = storyB.id;

    const newVersionB = { ...storyBDraft };
    newVersionB.id = 'df4df4df4df4df4df4df4df5';
    newVersionB.storyId = storyB.id;

    db.insertVersion(storyB.id, newVersionA);
    db.insertVersion(storyB.id, newVersionB);

    // removing everything
    db.deleteStory(storyB.id);

    const versions = db.getVersionsByStory(storyB.id);
    const story = db.getStoryById(storyB.id);

    expect(story).to.be.equal(undefined);
    expect(versions.length).to.be.equal(0);
  });

  test('should save new backup info', function () {
    const backupEntry = {
      providers: ['local', 'cloud'],
      timestamp: Date.now(),
    };

    db.insertBackupEntry(backupEntry);
    
    const backups = db.getBackupEntries();
    expect(backups).to.be.eql([backupEntry]);
  });

  test('should insert activity entry', function () {
    const firstEntry = {
      date: '2020-03-15',
      storyId: '0001',
      wordCount: 1375,
    };
    
    db.insertActivityEntry(firstEntry);
    
    let entries = db.getActivityHistory();
    delete entries[0].id

    expect(entries).to.be.eql([{
      date: '2020-03-15',
      entries: [{
        storyId: '0001',
        wordCount: 1375,
      }]
    }]);

    const secondEntry = {
      date: '2020-03-15',
      storyId: '0002',
      wordCount: 500,
    };

    db.insertActivityEntry(secondEntry);

    entries = db.getActivityHistory();
    delete entries[0].id
    expect(entries).to.be.eql([{
      date: '2020-03-15',
      entries: [{
        storyId: '0001',
        wordCount: 1375,
      }, {
        storyId: '0002',
        wordCount: 500,
      }],
    }]);

    const thirdEntry = {
      date: '2020-03-15',
      storyId: '0002',
      wordCount: 1000,
    };

    db.insertActivityEntry(thirdEntry);

    entries = db.getActivityHistory();
    delete entries[0].id
    expect(entries).to.be.eql([{
      date: '2020-03-15',
      entries: [{
        storyId: '0001',
        wordCount: 1375,
      }, {
        storyId: '0002',
        wordCount: 1000,
      }],
    }]);
  });
});
