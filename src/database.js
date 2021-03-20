const lodashId = require('lodash-id');
const low = require('lowdb');
const path = require('path');
const FileSync = require('lowdb/adapters/FileSync');
const Errors = require('./errors');

const DB_FILE = 'babel.json';
const STORIES_COLLECTION = 'stories';
const VERSIONS_COLLECTION = 'versions';
const BACKUP_COLLECTION = 'backups';
const ACTIVITY_COLLECTION = 'activity';

class BabelDb {
  constructor(workspaceDir) {
    this.dbPath = path.join(workspaceDir, DB_FILE);
    this.adapter = new FileSync(this.dbPath);
    this.db = low(this.adapter);
    this.db._.mixin(lodashId);

    this.db.defaults({ 'stories': [], 'versions': [], 'backups': [], 'activity': [] })
      .write();
  }

  /**
   * Insert a new story into the database.
   * @param {Object} storyDescriptor 
   * @return the String id of the newly inserted story
   */
  insertStory(storyDescriptor) {
    return this.db
      .read()
      .get(STORIES_COLLECTION)
      .insert(storyDescriptor)
      .write();
  }

  /**
   * Insert a new version in the database for the given story.
   * @param {String} storyId story id in the database
   * @param {Object} versionObj object describing the version
   * @return {Object} the object insert into database
   * @throws {STORY_NOT_FOUND} if the story id provided does not exist
   *    in the database
   */
  insertVersion(storyId, versionObj) {
    const storyObj = this.getStoryById(storyId);

    if (!storyObj) {
      throw new Error(Errors.STORY_NOT_FOUND);
    }

    const versionInsertedObj = this.db
      .read()
      .get(VERSIONS_COLLECTION)
      .insert(versionObj)
      .write();

    storyObj.versions.push(versionInsertedObj.id)
    const updateObj = { id: storyId, versions: storyObj.versions };
    this.updateStoryInfo(updateObj);

    return versionInsertedObj;
  }

  /**
   * Get a single version by its id.
   * @param {String} versionId version id in the database
   */
  getVersionById(versionId) {
    return this.db
      .read()
      .get(VERSIONS_COLLECTION)
      .getById(versionId)
      .value();
  }

  /**
   * Retrieves a version by its story id and its name.
   * @param {String} storyId story id in the database
   * @param {String} versionName name of the version
   */
  getVersionByStoryIdAndName(storyId, versionName) {
    return this.db
      .read()
      .get(VERSIONS_COLLECTION)
      .filter({ storyId, name: versionName })
      .value();
  }

  /**
   * Get all stories stored in the database including its versions.
   * @param {String} orderBy sort the results by this key
   * @return a maybe freaking big object with all stories
   */
  getAllStories(orderBy) {
    return this.db
      .read()
      .get(STORIES_COLLECTION)
      .sortBy(orderBy)
      .value();
  }

  /**
   * Get a story by its id.
   * @param {String} storyId story id in the database
   */
  getStoryById(storyId) {
    return this.db
      .read()
      .get(STORIES_COLLECTION)
      .getById(storyId)
      .value();
  }

  /**
   * Get all versions under a given story.
   * @param {String} storyId story id in the database
   */
  getVersionsByStory(storyId) {
    return this.db
      .read()
      .get(VERSIONS_COLLECTION)
      .filter({ storyId })
      .value();
  }

  /**
   * Updates a version entry in the database.
   * @param {Object} version version object. Must contain the 'id' parameter
   * @return {Object} the updated object
   */
  updateVersionInfo(version) {
    return this.db
      .read()
      .get(VERSIONS_COLLECTION)
      .updateById(version.id, version)
      .write();
  }

  /**
   * Updates a story entry in the database.
   * @param {Object} story story object. Must contain the 'id' parameter
   * @return {Object} the updated object
   */
  updateStoryInfo(story) {
    return this.db
      .read()
      .get(STORIES_COLLECTION)
      .updateById(story.id, story)
      .write();
  }

  /**
   * Delete a version from the database.
   * @param {String} storyId story id in the database
   * @param {String} versionId version id in the database
   * @throws {STORY_NOT_FOUND} if there is no story in the database with
   *    the provided id
   */
  deleteVersion(storyId, versionId) {
    const story = this.getStoryById(storyId);

    if (!story) {
      throw new Error(Errors.STORY_NOT_FOUND);
    }

    const versions = story.versions;

    const index = versions.indexOf(versionId);

    if (index !== -1) {
      versions.splice(index, 1);
    }

    this.updateStoryInfo({ id: storyId, versions });

    this.db
      .get(VERSIONS_COLLECTION)
      .removeById(versionId)
      .write();
  }

  /**
   * Delete a story and all its versions from database.
   * @param {String} storyId story id in the database
   */
  deleteStory(storyId) {
    this.db
      .get(STORIES_COLLECTION)
      .removeById(storyId)
      .write();

    this.db
      .get(VERSIONS_COLLECTION)
      .removeWhere({ storyId: storyId })
      .write();
  }

  /**
   * Insert a new backup entry in backup history.
   * @param {Object} backupDescriptor object describing the backup
   * @param {Number} backupDescriptor.timestamp timestamp in milliseconds
   * @param {String} backupDescriptor.localPath local path of the backup file
   * @param {Array} backupDescriptor.cloudProviders cloud storage providers to
   *    where the backup was sent
   */
  insertBackupEntry(backupDescriptor) {
    this.db
      .get(BACKUP_COLLECTION)
      .insert(backupDescriptor)
      .write();
  }

  /**
   * Get entire backup history from database.
   * @returns {Array} array containing all backup entries
   */
  getBackupEntries() {
    return this.db
      .read()
      .get(BACKUP_COLLECTION)
      .sortBy(['timestamp'])
      .value()
      .reverse();
  }

  insertActivityEntry(entryDescriptor) {
    let dayHistory = this.db
      .read()
      .get(ACTIVITY_COLLECTION)
      .find({ date: entryDescriptor.date })
      .value();

    const entry = {
      versionId: entryDescriptor.versionId,
      wordCount: entryDescriptor.wordCount,
    };

    if (!dayHistory) {
      // simply insert a new entry for the day
      this.db
        .get(ACTIVITY_COLLECTION)
        .insert({
          date: entryDescriptor.date,
          entries: [entry],
        })
        .write();
    } else {
      // bit more tricky, we have to add the word count
      // to the existing entry for that version
      let found = false;
      for (let i = 0; i < dayHistory.entries.length; i++) {
        let e = dayHistory.entries[i];

        if (e.versionId == entry.versionId) {
          dayHistory.entries[i] = entry;
          found = true;
          break;
        }
      }

      if (!found) {
        dayHistory.entries.push(entry);
      }

      this.db
        .get(ACTIVITY_COLLECTION)
        .filter({ date: entryDescriptor })
        .update(dayHistory)
        .write();
    }
  }

  getActivityHistory() {
    return this.db
      .read()
      .get(ACTIVITY_COLLECTION)
      .sortBy(['date'])
      .value()
      .reverse();
  }

  /**
   * Drop the entire database. The story files are not deleted, just
   * their metadata.
   */
  drop() {
    this.db
      .get(STORIES_COLLECTION)
      .removeWhere({})
      .write();

    this.db
      .get(VERSIONS_COLLECTION)
      .removeWhere({})
      .write();
  }
}

module.exports = {
  BabelDb,
};
