const moment = require('moment');
const { BabelDb } = require('../database');

class ActivityManager {
  constructor(workspaceDirectory) {
    this.workspaceDirectory = workspaceDirectory;
    this.db = new BabelDb(this.workspaceDirectory);
    this.identifier = this.createSessionId();
    this.activityEntries = {};

    this.initSession();
  }

  /**
   * Private method to initialize the session manager. We first have
   * to query the db if there is already a session for the current date.
   * This is for the cases when the user closes vscode and opens it again
   * later in the same day.
   */
  initSession() {
    const actDate = this.db.getActivityForDate(this.identifier);

    if (actDate) {
      actDate.entries.forEach((e) => {
        this.activityEntries[e.storyId] = {
          sessionWordCount: e.wordCount,
          initialWordCount: e.initialWordCount, // this is wrong
        };
      });
    }
  }

  /**
   * Returns a session id corresponding to the current
   * date.
   * @returns formatted date to be used as session id
   */
  createSessionId() {
    return moment().format('YYYY-MM-DD');
  }

  /**
   * Starts monitoring the given story for updates.
   * @param {Object} versionObj version object
   */
  initDocument(versionObj) {
    console.log('Initializing document with descriptor', versionObj);
    
    if (!Object.keys(this.activityEntries).includes(versionObj.storyId)) {
      this.activityEntries[versionObj.storyId] = {
        sessionWordCount: 0,
        initialWordCount: versionObj.wordCount,
      }
    } else {
      const existingEntry = this.activityEntries[versionObj.storyId];
      existingEntry.initialWordCount = versionObj.wordCount - existingEntry.sessionWordCount;
    }
  }

  /**
   * Get the daily activity for a given story.
   * @param {String} storyId story id
   * @returns object with the word count for the day for this story
   */
  getActivityForStory(storyId) {
    // for now the only activity is to return the current word count
    return { sessionWordCount: this.activityEntries[storyId].sessionWordCount };
  }

  /**
   * Updates the activity for a given story by calculating the diff
   * word count. If the difference turns out to be negative (i.e. the
   * author excluded more words than he/she wrote), then we set the
   * session word count as zero.
   * @param {Object} versionObj version object
   */
  updateActivity(versionObj) {
    if (!Object.keys(this.activityEntries).includes(versionObj.storyId)) {
      // this should never happen...
      this.initDocument(versionObj);
      return;
    }

    const wordCountDiff = versionObj.wordCount - this.activityEntries[versionObj.storyId].initialWordCount;
    
    if (wordCountDiff < 0) {
      this.activityEntries[versionObj.storyId].sessionWordCount = 0;
    } else {
      this.activityEntries[versionObj.storyId].sessionWordCount = wordCountDiff;
    }
  }

  /**
   * Save a single story activity into database.
   * This is to be used when saving a document.
   * @param {Object} versionObj version object
   */
  saveStoryActivity(versionObj) {
    if (!Object.keys(this.activityEntries).includes(versionObj.storyId)) {
      // this should never happen...
      return;
    }

    const storyId = versionObj.storyId;

    this.db.insertActivityEntry({
      storyId,
      date: this.identifier,
      wordCount: this.activityEntries[storyId].sessionWordCount,
      initialWordCount: this.activityEntries[storyId].initialWordCount,
    })
  }
}

module.exports = {
  ActivityManager,
};
