const fs = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf').sync;
const { expect } = require('chai');
const { BabelDb } = require('../../src/database');
const { Manager } = require('../../src/manager');

suite('manager tests', function () {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bab-'));
  const manager = new Manager(tempDir);
  const db = new BabelDb(tempDir);

  let storyId = '';
  let versionObj = undefined;

  this.beforeAll(function () {
    db.drop();
  });

  this.afterAll(function () {
    rimraf(tempDir);
  });

  test('should create new story', function () {
    storyId = manager.createNewStory().story.id;

    // checking only files, we don't need to test data layer again here
    const storyDirectory = path.join(tempDir, storyId);
    expect(fs.lstatSync(storyDirectory).isDirectory()).to.be.equal(true);
    expect(fs.existsSync(path.join(storyDirectory, 'draft.md'))).to.be.equal(true);
  });

  test('should create new version', function () {
    versionObj = manager.createNewVersion(storyId, 'revision');

    const versionFilePath = path.join(tempDir, storyId, 'revision.md');
    expect(fs.existsSync(versionFilePath)).to.be.equal(true);
  });

  test('should load version from path', function () {
    const storyVersionObj = manager.loadVersionFromPath(path.join(tempDir, storyId, 'revision.md'));
    
    expect(storyVersionObj.story.title).to.be.equal('New story');
    expect(storyVersionObj.version.id).to.be.equal(versionObj.id);
    expect(storyVersionObj.version.name).to.be.equal(versionObj.name);
    expect(storyVersionObj.version.wordCount).to.be.equal(versionObj.wordCount);
  });

  test('should change version name', function () {
    manager.editVersionName(versionObj, 'new version name', true);
    versionObj.name = 'new_version_name';

    const oldFilePath = path.join(tempDir, storyId, 'revision.md');
    const versionFilePath = path.join(tempDir, storyId, 'new_version_name.md');
    
    expect(fs.existsSync(versionFilePath)).to.be.equal(true);
    expect(fs.existsSync(oldFilePath)).to.be.equal(false);

    const versions = db.getVersionsByStory(storyId);
    const versionNames = [];

    versions.forEach((v) => {
      versionNames.push(v.name);
    });

    expect(versionNames).to.contain('new version name');
    expect(versionNames).not.to.contain('revision');
  });

  test('should copy contents between versions', function () {
    const content = 'Walking the old path turned me towards death\nThe ravens woke at dawn\nAnd daylight plumed my skin\nThen the air was full, simply composed of prey\n';
    const draftPath = manager.getVersionPath(storyId, 'draft');
    const revisionPath = manager.getVersionPath(storyId, 'revision');

    fs.writeFileSync(draftPath, content);

    manager.copyContent(storyId, 'draft', 'revision');

    const revisionContent = fs.readFileSync(revisionPath).toString();
    expect(revisionContent).to.be.equal(content);
  });

  test('should remove version', function () {
    manager.removeVersion(storyId, versionObj, true);
    const versionPath = manager.getVersionPath(storyId, versionObj.name);

    expect(fs.existsSync(versionPath)).to.be.equal(false);
  });

  test('should remove story', function () {
    manager.removeStory(storyId, true);
    const storyPath = path.join(tempDir, storyId);

    expect(fs.existsSync(storyPath)).to.be.equal(false);
  });
})