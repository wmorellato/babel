const fs = require('fs');
const path = require('path');
const util = require('util');
const vscode = require('vscode');
const settings = require('../settings');
const { Manager, Version } = require('../manager');
const { StoryDataProvider, VersionInfoProvider } = require('./story-view-data-provider');
const Errors = require('../errors');

// word regex, compiling first
const RE_WORD = new RegExp('\\w+', 'g');

/**
 * Custom yes/no quick pick to support title and item description. May
 * move to its own class.
 * @param {{title: String, yesDescription: String, noDescription: String}} options title, yesDescription, noDescription
 * @param {Function} callback callback function to receive the result
 */
function yesNoFlexible(options, callback) {
  const yesItem = {
    description: options.yesDescription,
    label: 'Yes',
  };

  const noItem = {
    description: options.noDescription,
    label: 'No',
  };

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = options.title;
  quickPick.items = [yesItem, noItem];
  quickPick.ignoreFocusOut = true;

  quickPick.onDidAccept(() => {
    const selectedItem = quickPick.activeItems.map(item => item.label)[0];
    quickPick.dispose();

    callback(undefined, selectedItem);
  });

  quickPick.show();
}

const yesNoPromise = util.promisify(yesNoFlexible);

async function openTitleInputBox(isEdit) {
  const options = {
    ignoreFocusOut: true,
    placeHolder: 'Ex.: One Hundred Years of Solitude',
    value: isEdit ? 'New title' : 'New story',
    prompt: isEdit ? 'Enter the new title for this story' : 'Enter the title of your new story (if you already know it). The default title is "New story"',
  };

  const title = await vscode.window.showInputBox(options);
  return title;
}

async function openDraftSelectionBox(isEdit) {
  const inputOptions = {
    ignoreFocusOut: true,
    placeHolder: 'Ex.: draft 2',
    value: 'new version',
    prompt: isEdit ? 'Enter the new name of the version' : 'Enter the name of the new version',
  };

  const quickPickOptions = {
    ignoreFocusOut: true,
    placeHolder: 'Select the type of the new version',
  };

  const version = await vscode.window.showQuickPick(Object.values(Version), quickPickOptions);

  if (version === Version.CUSTOM) {
    return await vscode.window.showInputBox(inputOptions);
  }

  return version;
}

/**
 * Checks if the current workspace contains our database file. If not, assume
 * the it's not a Babel workspace and asks the user if she wants to set it
 * as so.
 * @param {String} currentWorkspace path of current workspace
 */
async function isBabelWorkspace(currentWorkspace) {
  if (fs.existsSync(path.join(currentWorkspace, 'babel.json'))) {
    return true;
  }

  const choice = await yesNoPromise({
    title: 'This seems not to be a Babel workspace. Do you want to set this directory as a workspace? Stories will be stored in this directory.',
    yesDescription: `Directory: ${currentWorkspace}`,
    noDescription: 'You will be prompted again on next VSCode startup.',
  });

  if (choice !== 'Yes') {
    return false;
  }

  return true;
}

class WorkspaceManager {
  /**
   * Initializes all classes.
   * @param {vscode.ExtensionContext} context context passed by vscode
   */
  constructor(context) {
    this.workspaceDirectory = vscode.workspace.workspaceFolders[0].uri.fsPath;
    this.context = context;
    this.manager = new Manager(this.workspaceDirectory);

    this.initProviders();
    this.initVersionInfoView();
  }

  /**
   * Check if the active editor on startup (if there is any) is a story,
   * and if so, initialize the version info view.
   */
  initVersionInfoView() {
    const activeTextEditor = vscode.window.activeTextEditor;

    if (!activeTextEditor || !this.manager.isStory(activeTextEditor.document.fileName)) {
      vscode.commands.executeCommand('setContext', 'versionIsOpen', false);
      return true;
    }

    const storyVersionObj = this.manager.loadVersionFromPath(activeTextEditor.document.fileName);
    this.visibleVersions[storyVersionObj.version.id] = storyVersionObj;
    this.activeVersion = storyVersionObj.version.id;
    
    this.loadInfoForVersion(storyVersionObj);
  }

  /**
   * Initialize data providers for the story explorer and version
   * info view.
   */
  initProviders() {
    this.activeVersion = undefined;
    this.visibleVersions = {};
    this.storyDataProvider = new StoryDataProvider(this.manager);
    this.versionInfoProvider = new VersionInfoProvider();

    // data provider for the main view
    vscode.window.registerTreeDataProvider('story-entries', this.storyDataProvider);
    // data provider for version info
    vscode.window.registerTreeDataProvider('version-info', this.versionInfoProvider);
  }

  /**
   * New story command handler
   */
  async newStoryCommand() {
    const storyTitle = await openTitleInputBox();

    if (storyTitle === undefined) {
      return;
    }

    const storyVersion = this.manager.createNewStory(storyTitle);
    this.updateViews();
    this.openVersionCommand(storyVersion.story, storyVersion.version);
  }

  /**
   * New version command handler
   * @param {StoryItem} storyItem StoryItem instance passed by vscode
   */
  async newVersionCommand(storyItem) {
    const versionName = await openDraftSelectionBox();

    if (!versionName) {
      vscode.window.showErrorMessage('Version name can not be empty!');
      return;
    }

    const choice = await yesNoPromise({ title: 'Do you want to copy the contents from the draft?' });
    const storyObj = storyItem.story;

    try {
      const versionObj = this.manager.createNewVersion(storyObj.id, versionName);
      // ---------------
      if (choice === 'Yes') {
        this.manager.copyContent(storyObj.id, 'draft', versionName);
      }

      this.openVersionCommand(storyObj, versionObj);
      this.updateViews();
    } catch (e) {
      if (e.message === Errors.VERSION_ALREADY_EXISTS_ERROR) {
        vscode.window.showErrorMessage('This story already has a version with this name!');
      }
    }
  }

  /**
   * Open the version text document
   * @param {Object} simpleStoryObj story object without version property
   * @param {Object} versionObj version object
   */
  openVersionCommand(simpleStoryObj, versionObj) {
    const versionPath = this.manager.getVersionPath(simpleStoryObj.id, versionObj.name);

    vscode.workspace.openTextDocument(versionPath).then((textDocument) => {
      this.updateVersionInfoData(simpleStoryObj, versionObj);
      vscode.window.showTextDocument(textDocument);
    });
  }

  /**
   * Handle the editVersionName command.
   * @param {VersionItem} versionNode VersionItem object that received the
   *    edit command
   */
  async editVersionNameCommand(versionNode) {
    const newName = await openDraftSelectionBox();

    if (!newName) {
      vscode.window.showErrorMessage('Version name can not be empty!');
      return;
    }

    try {
      this.manager.editVersionName(versionNode.version, newName, true);

      if (versionNode.version.id === this.focusedVersion.id) {
        this.focusedVersion.name = newName;
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      this.updateViews();
    } catch (e) {
      if (e.message === Errors.VERSION_ALREADY_EXISTS_ERROR) {
        vscode.window.showErrorMessage('This story already has a version with this name!');
      }

      if (e.message === Errors.VERSION_DB_UPDATE_ERROR) {
        vscode.window.showErrorMessage('Error renaming this version. Please, reopen the file and try again.');
      }
    }
  }

  /**
   * Changes the title of the story
   * @param {StoryItem} storyNode story TreeItem node
   */
  async editStoryTitle(storyNode) {
    const newTitle = await openTitleInputBox();

    if (newTitle === undefined) {
      return;
    }

    try {
      this.manager.editStoryTitle(storyNode.story.id, newTitle);
      this.updateViews();
    } catch (e) {
      if (e.message === Errors.STORY_DB_UPDATE_ERROR) {
        vscode.window.showErrorMessage('This story already has a version with this name!');
      }
    }
  }

  /**
   * Deletes a version.
   * @param {VersionItem} versionNode version TreeItem node
   */
  async removeVersion(versionNode) {
    if (settings.isHardDeleteSet()) {
      const choice = await yesNoPromise({ title: 'This operation will also delete the file associated with this version. Do you want to proceed?' });

      if (!choice || choice === 'No') {
        return;
      }
    }

    try {
      this.manager.removeVersion(versionNode.version.storyId, versionNode.version, settings.isHardDeleteSet());
      this.updateViews();
    } catch (e) {
      if (e.message === Errors.STORY_NOT_FOUND) {
        vscode.window.showErrorMessage('There was an error removing this story from database. Please, reopen vscode and try again.');
      }
    }
  }

  /**
   * Deletes a story.
   * @param {StoryItem} storyNode story TreeItem node
   */
  async removeStory(storyNode) {
    if (settings.isHardDeleteSet()) {
      const choice = await yesNoPromise({ title: 'This operation will delete ALL version files for this story. Do you want to proceed?' });

      if (!choice || choice === 'No') {
        return;
      }
    }

    this.manager.removeStory(storyNode.story.id, settings.isHardDeleteSet());
    this.updateViews();
  }

  /**
   * Count the number of words in the give document.
   * @param {vscode.TextDocument} textDocument TextDocument instance
   * @return the number of words in the document
   */
  getDocumentWordCount(textDocument) {
    const match = textDocument.getText().match(RE_WORD);

    if (!match) {
      return 0;
    } else {
      return match.length;
    }
  }

  /**
   * Update the data held by VersionInfoProvider.
   * @param {Object} simpleStoryObj story object
   * @param {Object} versionObj version object
   */
  updateVersionInfoData(simpleStoryObj, versionObj) {
    this.versionInfoProvider.version = versionObj;
    this.versionInfoProvider.story = simpleStoryObj;
  }

  /**
   * Load info for the current active version. Assumes that the active
   * TextEditor holds a version.
   * 
   * TODO: it seems dumb to receive a version obj when this is only
   * called on the active version. Verify this.
   * 
   * @param {Object} storyVersionObject object containing info for active
   *    story and version
   */
  loadInfoForVersion(storyVersionObj) {
    this.updateVersionInfoData(storyVersionObj.story, storyVersionObj.version);
    this.updateViews();

    vscode.commands.executeCommand('setContext', 'versionIsOpen', true);
  }

  /**
   * Check if the TextEditor just select is a story or not, and if so
   * load its info.
   * @param {vscode.TextEditor} textEditor TextEditor instance
   */
  onDidChangeEditor(textEditor) {
    if (!textEditor || !this.manager.isStory(textEditor.document.fileName)) {
      vscode.commands.executeCommand('setContext', 'versionIsOpen', false);
      this.activeVersion = '';
      return true;
    }

    const storyVersionObj = this.manager.loadVersionFromPath(textEditor.document.fileName);

    if (!Object.keys(this.visibleVersions).includes(storyVersionObj.version.id)) {
      storyVersionObj.version.wordCount = this.getDocumentWordCount(textEditor.document);
    }

    this.visibleVersions[storyVersionObj.version.id] = storyVersionObj;
    this.activeVersion = storyVersionObj.version.id;

    this.loadInfoForVersion(storyVersionObj);
  }

  /**
   * Listener for document changes events. Calculate the number of words in the
   * document and print in the ViewInfo view.
   * @param {vscode.TextDocumentChangeEvent} changeEvent event describing a document change
   */
  onDidDocumentChange(changeEvent) {
    const numWords = this.getDocumentWordCount(changeEvent.document);
    this.visibleVersions[this.activeVersion].version.wordCount = numWords;

    this.loadInfoForVersion(this.visibleVersions[this.activeVersion]);
  }

  /**
   * Closed document event.
   * @param {vscode.TextDocument} textDocument the document just closed
   */
  onDidCloseDocument(textDocument) {
    if (!this.manager.isStory(textDocument.fileName)) {
      return true;
    }

    const storyVersionObj = this.manager.loadVersionFromPath(textDocument.fileName);
    delete this.visibleVersions[storyVersionObj.version.id];
  }

  /**
   * Flush the modifications into the version object in the database.
   * @param {TextDocumentWillSaveEvent} documentWillSaveEvent the event fired by vscode 
   */
  onWillSaveDocument(documentWillSaveEvent) {
    if (!this.manager.isStory(documentWillSaveEvent.document.fileName)) {
      return true;
    }

    // when using "Save all..." not only the active editor will be saved, so I
    // need to flush every change to db
    const storyVersionObj = this.manager.loadVersionFromPath(documentWillSaveEvent.document.fileName);

    this.visibleVersions[storyVersionObj.version.id].modified = Date.now();
    this.manager.updateVersionInfo(this.visibleVersions[storyVersionObj.version.id].version);

    if (storyVersionObj.version.id === this.activeVersion) {
      this.loadInfoForVersion(storyVersionObj);
    }
  }

  /**
   * Update both data providers.
   */
  updateViews() {
    if (this.versionInfoProvider) {
      this.versionInfoProvider.refresh();
    }

    this.storyDataProvider.refresh();
  }

  /**
   * Hide the VersionInfo view.
   * @param {TextEditor} textEditor TextEditor instance
   */
  onDidCloseEditor() {
    if (!vscode.window.activeTextEditor) {
      vscode.commands.executeCommand('setContext', 'versionIsOpen', false);
      this.focusedVersion = undefined;
    }
  }
}

module.exports = {
  isBabelWorkspace,
  WorkspaceManager,
};
