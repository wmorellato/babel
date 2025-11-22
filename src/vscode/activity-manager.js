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
        // Backward compatibility: if initialWordCount exists, it's an old entry
        if (e.initialWordCount !== undefined) {
          // Old format: use initialWordCount
          this.activityEntries[e.storyId] = {
            sessionWordCount: e.wordCount,
            initialWordCount: e.initialWordCount,
            gitBased: false,
          };
        } else {
          // New format: wordCount is the net words from git
          this.activityEntries[e.storyId] = {
            sessionWordCount: e.wordCount,
            gitBased: true,
          };
        }
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
   * Only used for file-based stories. Git-based stories use trackGitWords instead.
   * @param {Object} versionObj version object
   */
  initDocument(versionObj) {
    console.log('Initializing document with descriptor', versionObj);

    if (!Object.keys(this.activityEntries).includes(versionObj.storyId)) {
      this.activityEntries[versionObj.storyId] = {
        sessionWordCount: 0,
        initialWordCount: versionObj.wordCount,
        gitBased: false,
      };
    } else {
      const existingEntry = this.activityEntries[versionObj.storyId];
      // Don't overwrite git-based tracking
      if (!existingEntry.gitBased) {
        existingEntry.initialWordCount = versionObj.wordCount - existingEntry.sessionWordCount;
      }
    }
  }

  /**
   * Track net words from git commits for git-based stories.
   * This accumulates net words written (additions minus deletions).
   * @param {String} storyId story id
   * @param {Number} netWords net words written (can be negative)
   */
  trackGitWords(storyId, netWords) {
    if (!Object.keys(this.activityEntries).includes(storyId)) {
      this.activityEntries[storyId] = {
        sessionWordCount: netWords,
        gitBased: true, // Mark as git-based tracking
      };
    } else {
      this.activityEntries[storyId].sessionWordCount += netWords;
      this.activityEntries[storyId].gitBased = true;
    }

    // Save to database
    this.db.insertActivityEntry({
      storyId,
      date: this.identifier,
      wordCount: this.activityEntries[storyId].sessionWordCount,
      // Don't store initialWordCount for git-based stories
    });
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
   * Only used for file-based stories. Git-based stories use trackGitWords instead.
   * @param {Object} versionObj version object
   */
  updateActivity(versionObj) {
    if (!Object.keys(this.activityEntries).includes(versionObj.storyId)) {
      // this should never happen...
      this.initDocument(versionObj);
      return;
    }

    const entry = this.activityEntries[versionObj.storyId];

    // Don't update git-based tracking this way
    if (entry.gitBased) {
      return;
    }

    const wordCountDiff = versionObj.wordCount - entry.initialWordCount;

    if (wordCountDiff < 0) {
      entry.sessionWordCount = 0;
    } else {
      entry.sessionWordCount = wordCountDiff;
    }
  }

  /**
   * Save a single story activity into database.
   * This is to be used when saving a document.
   * Only used for file-based stories. Git-based stories save via trackGitWords.
   * @param {Object} versionObj version object
   */
  saveStoryActivity(versionObj) {
    if (!Object.keys(this.activityEntries).includes(versionObj.storyId)) {
      // this should never happen...
      return;
    }

    const storyId = versionObj.storyId;
    const entry = this.activityEntries[storyId];

    // Don't save git-based tracking this way (it's saved via trackGitWords)
    if (entry.gitBased) {
      return;
    }

    // Old format: save both wordCount and initialWordCount
    this.db.insertActivityEntry({
      storyId,
      date: this.identifier,
      wordCount: entry.sessionWordCount,
      initialWordCount: entry.initialWordCount,
    });
  }
}

module.exports = {
  ActivityManager,
};
