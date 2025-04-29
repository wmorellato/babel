const fs = require('fs');
const path = require('path');
const util = require('util');
const vscode = require('vscode');
const parseMD = require('parse-md').default;
const utils = require('../utils');
const settings = require('../settings');
const { Exporter } = require('../exporter');
const { Manager, Version } = require('../manager');
const { ActivityManager } = require('./activity-manager');
const { ActivityChartViewProvider } = require('./activity-view');
const { StoryDataProvider, VersionInfoProvider, BackupHistoryProvider } = require('./story-view-data-provider');
const Errors = require('../errors');

let decorationTypes = [];

// word regex, compiling first
const RE_WORD = new RegExp('\\w+', 'g');

async function showAvailableTemplatesDialog(message) {
  const quickPickItems = [];
  const templates = Exporter.getAvailableTemplates();

  Object.keys(templates).forEach((id) => {
    quickPickItems.push({
      id,
      label: templates[id],
    });
  });

  const quickPickOptions = {
    ignoreFocusOut: true,
    placeHolder: message || 'Choose the template you wish to export this story',
  };

  return await vscode.window.showQuickPick(quickPickItems, quickPickOptions);
}

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
    this.activityManager = new ActivityManager(this.workspaceDirectory);

    this.initProviders();
    this.initVersionInfoView();
    this.initActivityView();
    this.initBackup();
  }

  initActivityView() {
    // activity chart
    const provider = new ActivityChartViewProvider(this.context.extensionUri, this.workspaceDirectory);
    this.context.subscriptions.push(vscode.window.registerWebviewViewProvider(provider.viewType, provider));
  }

  initBackup() {
    const backupOptions = settings.getBackupOptions();
    this.manager.initBackupManager(backupOptions)
      .then(() => {
        vscode.window.showInformationMessage('Backup manager running.');
      }).catch((e) => {
        vscode.window.showErrorMessage(`Unable to start backup manager. Error: ${e}`, {
          modal: true,
        });
      });
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
    this.activityManager.initDocument(storyVersionObj.version);
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
    this.backupHistoryProvider = new BackupHistoryProvider(this.manager.db.getBackupEntries());

    // data provider for the main view
    vscode.window.registerTreeDataProvider('story-entries', this.storyDataProvider);
    // data provider for version info
    vscode.window.registerTreeDataProvider('version-info', this.versionInfoProvider);
    // data provider for backup entries
    vscode.window.registerTreeDataProvider('backup-history', this.backupHistoryProvider);
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

    const storyObj = storyItem.story;

    try {
      const versionObj = this.manager.createNewVersion(storyObj.id, versionName);

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

    return vscode.workspace.openTextDocument(versionPath).then((textDocument) => {
      this.updateVersionInfoData(simpleStoryObj, versionObj);
      this.activityManager.initDocument(versionObj);
      
      return vscode.window.showTextDocument(textDocument);
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

      if (versionNode.version.id === this.activeVersion) {
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

  async sendToKindle(versionNode) {
    
  }

  /**
   * 
   * @param {VersionItem} versionNode 
   */
  async exportToTemplate(versionNode) {
    // desnecessario
    this.openVersionCommand(versionNode.simpleStoryObj, versionNode.version)
      .then(async (textEditor) => {
        if (!textEditor) {
          return vscode.window.showErrorMessage('Could not export this version.');
        }

        const template = await showAvailableTemplatesDialog();

        const outputFolder = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Select folder',
        });
    
        if (!outputFolder || outputFolder.length === 0) {
          return;
        }

        const storyDescriptor = this.getStoryData(textEditor, versionNode);

        const exporter = new Exporter(outputFolder[0].fsPath, storyDescriptor);
        exporter.export(template.id)
          .then(() => {
            vscode.window.showInformationMessage('Story succesfully exported. Good luck!');
          })
          .catch((error) => {
            console.error(error);
            vscode.window.showInformationMessage('Error exporting story.');
          });
      });
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
   * Count the number of words in the given document.
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
   * Count the number of words in the given text. This function
   * will be used to count the words before exporting to avoid
   * couting the words inside the header.
   * @param {String} text any text
   * @return the number of words in the document
   */
  getTextWordCount(text) {
    const match = text.match(RE_WORD);

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
   * Check if the TextEditor just selected is a story or not, and if so
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
    storyVersionObj.version.wordCount = this.getDocumentWordCount(textEditor.document);

    this.visibleVersions[storyVersionObj.version.id] = storyVersionObj;
    this.activeVersion = storyVersionObj.version.id;

    this.loadInfoForVersion(storyVersionObj);
    this.activityManager.initDocument(storyVersionObj.version);
  }

  /**
   * Listener for document changes events. Calculate the number of words in the
   * document and print in the ViewInfo view.
   * 
   * TODO: Okay, BIG problem here. Story/version information stored in visibleVersions
   * are out of sync from what is in database. This may bring further issues down the
   * line. For now, since I'm only updating the word count, it's okay. But, boy, aren't
   * you gonna regret this later.
   * 
   * Update 17-09-2024: No regrets as I have no idea anymore of what this does.
   * 
   * @param {vscode.TextDocumentChangeEvent} changeEvent event describing a document change
   */
  onDidDocumentChange(changeEvent) {
    if (!changeEvent || changeEvent.contentChanges.length == 0 || !this.manager.isStory(changeEvent.document.fileName)) {
      return true;
    }

    // here is the problem, I have to get info from db
    const storyVersionObj = this.manager.loadVersionFromPath(changeEvent.document.fileName);
    const versionId = storyVersionObj.version.id;
    
    // and here I have to update the word count for the version in visibleVersions
    // and in the storyVersionObj
    const numWords = this.getDocumentWordCount(changeEvent.document);

    this.visibleVersions[versionId].version.wordCount = numWords;
    storyVersionObj.version.wordCount = numWords;

    // and here, finally, I pass the storyVersionObj. I would have to update every
    // attribute for both of the instances
    // I think the right thing to do would be create a separate storyVersionObj instead
    // of using the one from db
    this.loadInfoForVersion(storyVersionObj);

    if (![Version.REVISION, Version.TRANSLATION].includes(storyVersionObj.version.name)) {
      this.activityManager.updateActivity(this.visibleVersions[versionId].version);
    }
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

    // when using "Save all..." all editors will be saved, so I
    // need to flush every change to db
    const storyVersionObj = this.manager.loadVersionFromPath(documentWillSaveEvent.document.fileName);
    const visibleVersion = this.visibleVersions[storyVersionObj.version.id].version;

    visibleVersion.modified = Date.now();
    storyVersionObj.version.wordCount = visibleVersion.wordCount; // same syncing problem

    this.manager.updateVersionInfo(visibleVersion);

    if (![Version.REVISION, Version.TRANSLATION].includes(visibleVersion.name)) {
      this.activityManager.saveStoryActivity(visibleVersion);
    }

    if (storyVersionObj.version.id === this.activeVersion) {
      this.loadInfoForVersion(storyVersionObj);
    }

    const textEditor = vscode.window.activeTextEditor;
    const characters = this.getCharactersFromMetadata(textEditor);

    if (decorationTypes.length > 0) {
      decorationTypes.forEach(decorationType => decorationType.dispose());
    }

    if (characters && characters.length > 0) {
      this.highlightCharacters(textEditor, characters);
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
   * Presents the user to the list of available templates and
   * inserts a header at the top of the file with the fields
   * present in that template.
   */
  async insertMetadata() {
    const textEditor = vscode.window.activeTextEditor;

    if (!textEditor || !this.manager.isStory(textEditor.document.fileName)) {
      return true;
    }

    const template = await showAvailableTemplatesDialog('Select the template');
    const defaultValues = { title: this.visibleVersions[this.activeVersion].story.title, ...settings.getAuthorInfo() };
    const metadataText = Exporter.getMetadataFromTemplate(template.id, defaultValues);

    textEditor.edit((editBuilder) => {
      editBuilder.insert(new vscode.Position(0, 0), metadataText);
    });
  }

  /**
   * Get story metadata. Tries to first get data from a header at the top
   * of the file, then from the Settings.
   * @param {vscode.TextEditor} textEditor the TextEditor holding the document
   *    to be exported
   * @param {Object} versionNode version TreeItem node
   */
  getStoryData(textEditor, versionNode) {
    try {
      const { metadata, content } = parseMD(textEditor.document.getText());

      const authorInfo = Object.keys(metadata).length > 0 ? metadata : settings.getAuthorInfo();
      const title = metadata.title ? metadata.title : versionNode.simpleStoryObj.title;
      delete authorInfo.title;
      
      return {
        title,
        content,
        word_count: this.getTextWordCount(content),
        ...authorInfo,
      }
    } catch (e) {
      vscode.window.showErrorMessage('There was an error trying to read the header contents.');
    }
  }

  /**
   * Return the word count for the text currently selected.
   * @param {vscode.TextDocument} document current document
   * @param {vscode.Position} position current position
   * @param {vscode.CancellationToken} token a cancellation token
   */
  wordCountHoverProvider(document, position, token) {
    const activeTextEditor = vscode.window.activeTextEditor;

    if (!activeTextEditor || !this.manager.isStory(activeTextEditor.document.fileName)) {
      return true;
    }

    if (activeTextEditor.selection.isEmpty || !activeTextEditor.selection.contains(position)) {
      return true;
    }

    let selectedText = activeTextEditor.document.getText(activeTextEditor.selection);
    let wordCount = this.getTextWordCount(selectedText);

    return new vscode.Hover(`${wordCount} words  \n${selectedText.length} characters`);
  }

  getCharactersFromMetadata(textEditor) {
    try {
      const { metadata, content } = parseMD(textEditor.document.getText());
      const characters = metadata.characters ? metadata.characters : '';

      if (characters.length === 0) {
        return [];
      }

      return characters.split(',').map(character => character.trim());
    } catch (e) {
      vscode.window.showErrorMessage('There was an error trying to read the header contents.');
    }
  }

  highlightCharacters(textEditor, characters) {
    const text = textEditor.document.getText();

    characters.forEach(character => {
        const regex = new RegExp(`\\b${character}\\b`, 'gi');
        const decorationsArray = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            const startPos = textEditor.document.positionAt(match.index);
            const endPos = textEditor.document.positionAt(match.index + match[0].length);
            const decoration = { range: new vscode.Range(startPos, endPos) };
            decorationsArray.push(decoration);
        }

        const color = utils.generateUniqueColor(character);
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: color,
        });
        decorationTypes.push(decorationType);

        textEditor.setDecorations(decorationType, decorationsArray);
    });
  }
}

module.exports = {
  isBabelWorkspace,
  WorkspaceManager,
};
