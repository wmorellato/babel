const fs = require('fs');
const path = require('path');
const rimrafSync = require('rimraf').sync;
const utils = require('./utils');
const { BabelDb } = require('./database');
const Errors = require('./errors');

const Version = {
  DRAFT: 'draft',
  REVISION: 'revision',
  TRANSLATION: 'translation',
  CUSTOM: 'other', // to be defined by the user later
};

class Manager {
  constructor(workspaceDirectory) {
    this.workspaceDirectory = workspaceDirectory;
    this.db = new BabelDb(this.workspaceDirectory);
  }

  /**
 * Create the worskpace directory structure. Check each entry
 * in the workspaceStructure const above and create one forlder
 * for each item.
 */
  createStoriesWorkspace() {
    if (!fs.existsSync(this.workspaceDirectory)) {
      fs.mkdirSync(this.workspaceDirectory);
    }
  }

  /**
   * Create an empty directory in the workspace with the story id
   * as its name.
   * @param {String} storyId id of story in database
   * @return {String} the full path of the newly created directory
   */
  createStoryDirectory(storyId) {
    const storyDirPath = path.join(this.workspaceDirectory, storyId);

    if (fs.existsSync(storyDirPath)) {
      throw new Error(Errors.STORY_ALREADY_EXISTS_ERROR);
    }

    fs.mkdirSync(storyDirPath);

    return storyDirPath;
  }

  /**
   * Create a new story with default values. It inserts the story
   * descriptor object into the database, creates a folder in the
   * workspace that will hold all versions and create the default
   * version 'draft.md'.
   * @param {String} title the title of story. Defaults to 'New story'
   * @return {Object} an object containing the newly inserted story and
   *    version, under the 'story' and 'version' keys, respectively
   */
  createNewStory(title) {
    // TODO: implement the option to create random titles
    const storyObj = {
      title: title || 'New story',
      created: Date.now(),
      submissionHistory: {},
      versions: [],
    };

    const storyDbObj = this.db.insertStory(storyObj);

    if (!storyDbObj) {
      throw new Error(Errors.STORY_INSERTION_FAILED);
    }

    this.createStoryDirectory(storyDbObj.id);
    const versionDbObj = this.createNewVersion(storyDbObj.id, Version.DRAFT);

    return {
      story: storyDbObj,
      version: versionDbObj,
    };
  }

  /**
   * Create a new version for a given story, inserting the description
   * into the database and creating the correspondig file in the story
   * directory.
   * @param {String} storyId id of story in database
   * @param {String} versionName the name of the new version
   * @return {Object} the version object just created
   */
  createNewVersion(storyId, versionName) {
    const normalizedVersionName = utils.normalizeFilename(versionName);
    const versionPath = path.join(this.workspaceDirectory, storyId, normalizedVersionName + '.md');

    if (fs.existsSync(versionPath)) {
      throw new Error(Errors.VERSION_ALREADY_EXISTS_ERROR);
    }

    const versionObj = {
      storyId,
      name: versionName,
      wordCount: 0,
      created: Date.now(),
      statistics: {},
    };

    this.db.insertVersion(storyId, versionObj);
    fs.writeFileSync(versionPath, '');

    return versionObj;
  }

  /**
   * Update version data in the database.
   * @param {Object} versionObj version object
   */
  updateVersionInfo(versionObj) {
    this.db.updateVersionInfo(versionObj);
  }

  /**
   * Given a document, tries to load the story and version info for
   * it. I do some basic input validation, but checking if the document
   * is in Babel workspace must be done by the caller.
   * @param {String} documentPath path of the document
   */
  loadVersionFromPath(documentPath) {
    if (!documentPath || typeof documentPath !== 'string') {
      return;
    }

    const parts = documentPath.split(path.sep);

    if (parts.length === 0) {
      return;
    }

    const storyId = parts[parts.length - 2];
    const versionFile = parts[parts.length - 1];
    const fileVersionName = versionFile.slice(0, versionFile.length - 3);

    const storyObj = this.db.getStoryById(storyId);
    let versionObj = undefined;

    if (!storyObj) {
      throw new Error(Errors.STORY_NOT_FOUND);
    }

    const storyVersions = this.db.getVersionsByStory(storyId);

    if (!storyVersions) {
      throw new Error(Errors.STORY_INVALID_VERSIONS);
    }

    storyVersions.forEach((v) => {
      if (utils.normalizeFilename(v.name) === fileVersionName) {
        versionObj = v;
      }
    });

    return {
      story: storyObj,
      version: versionObj,
    };
  }

  /**
   * Change the title of a story.
   * @param {String} storyId story id in the database
   * @param {String} newTitle the new title of the story
   */
  editStoryTitle(storyId, newTitle) {
    const updateInfo = {
      id: storyId,
      title: newTitle,
    };

    const newObj = this.db.updateStoryInfo(updateInfo);

    if (!newObj) {
      throw new Error(Errors.STORY_DB_UPDATE_ERROR);
    }
  }

  /**
   * Change the version name, updating the database entry and also renaming
   * the files, if renameFiles is set.
   * @param {Object} versionObj version object
   * @param {String} newName the new name of the version
   * @param {Boolean} renameFiles if this  should rename the files as well.
   */
  editVersionName(versionObj, newName, renameFiles) {
    const oldPath = this.getVersionPath(versionObj.storyId, utils.normalizeFilename(versionObj.name));
    const pathParts = utils.splitPathFile(oldPath);
    const newPath = path.join(pathParts[0], utils.normalizeFilename(newName) + '.md');

    if (fs.existsSync(newPath)) {
      throw new Error(Errors.VERSION_ALREADY_EXISTS_ERROR);
    }

    const updateInfo = {
      id: versionObj.id,
      name: newName,
    };

    const newObj = this.db.updateVersionInfo(updateInfo);

    if (!newObj) {
      throw new Error(Errors.VERSION_DB_UPDATE_ERROR);
    }

    if (renameFiles) {
      fs.renameSync(oldPath, newPath);
    }
  }

  /**
   * Remove a version and delete files if removeFiles is set to true
   * @param {String} storyId story id in the database
   * @param {Object} versionObj version object
   * @param {Boolean} removeFiles if false, only the database information for
   *    this version will be removed. The files will be kept.
   */
  removeVersion(storyId, versionObj, removeFiles) {
    try {
      this.db.deleteVersion(storyId, versionObj.id);
    } catch (e) {
      if (e.message == Errors.STORY_NOT_FOUND) {
        // let the lower frames handle this
        throw (e);
      }
    }

    const versionPath = this.getVersionPath(storyId, utils.normalizeFilename(versionObj.name));

    if (removeFiles) {
      fs.unlinkSync(versionPath);
    } else {
      // if the files are not removed, I still need to
      // rename it, otherwise it will not be possible to
      // create a version with the same name again
      fs.renameSync(versionPath, versionPath + `.${Date.now()}.deleted`);
    }
  }

  /**
   * Remove a story and all its versions and all associated files if
   *    removeFiles is set to true.
   * @param {String} storyId story id in the database
   * @param {Boolean} removeFiles if false, only the database information for
   *    this version will be removed. The files will be kept.
   */
  removeStory(storyId, removeFiles) {
    this.db.deleteStory(storyId);

    const storyPath = path.join(this.workspaceDirectory, storyId);

    if (removeFiles) {
      rimrafSync(storyPath);
    }
  }

  /**
   * Copy the contents of a version to another.
   * @param {String} storyId story id in the database
   * @param {String} versionSrc name of the source version
   * @param {String} versionDst name of the destination version
   */
  copyContent(storyId, versionSrc, versionDst) {
    const srcVersionPath = this.getVersionPath(storyId, versionSrc);
    const dstVersionPath = this.getVersionPath(storyId, versionDst);

    const content = fs.readFileSync(srcVersionPath);
    fs.writeFileSync(dstVersionPath, content);
  }

  /**
   * Checks if a document is in Babel workspace directory.
   * @param {String} documentPath 
   */
  isStory(documentPath) {
    if (!documentPath.toLowerCase().startsWith(this.workspaceDirectory.toLowerCase())) {
      return false;
    }

    if (path.basename(documentPath) === 'babel.json') {
      return false;
    }

    return true;
  }

  getVersionPath(storyId, versionName) {
    const normalizedName = utils.normalizeFilename(versionName);
    return path.join(this.workspaceDirectory, storyId, normalizedName + '.md');
  }
}

module.exports = {
  Version,
  Manager,
};
