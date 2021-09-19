const vscode = require('vscode');
const dateformat = require('dateformat');
const resources = require('./resource-manager');
const { Version } = require('../manager');

class VersionInfoProvider {
  constructor(storyObj, versionObj) {
    this.story = storyObj;
    this.version = versionObj;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  /**
   * Inherited method from TreeDataProvider
   * @param {TreeItem} element 
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * Inherited method from TreeDataProvider
   * @param {TreeItem} element 
   */
  getChildren(element) {
    if (element) {

    } else {
      return Promise.resolve(this.getFormattedVersionInfo());      
    }
  }

  /**
   * Refresh the view after a change
   */
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getFormattedVersionInfo() {
    if (!this.version || !this.story) {
      return [];
    }

    const titleItem = new vscode.TreeItem('Title', vscode.TreeItemCollapsibleState.None);
    titleItem.description = this.story.title;

    const versionNameItem = new vscode.TreeItem('Version', vscode.TreeItemCollapsibleState.None);
    versionNameItem.description = this.camelToSentence(this.version.name);

    const createItem = new vscode.TreeItem('Created', vscode.TreeItemCollapsibleState.None);
    createItem.description = dateformat(this.version.created);

    const modifiedItem = new vscode.TreeItem('Modified', vscode.TreeItemCollapsibleState.None);
    modifiedItem.description = dateformat(this.version.modified);

    const wordCountItem = new vscode.TreeItem('Word count', vscode.TreeItemCollapsibleState.None);
    wordCountItem.description = `${this.version.wordCount} words`;

    const statsItem = new vscode.TreeItem('Statistics', vscode.TreeItemCollapsibleState.Collapsed);

    return [titleItem, versionNameItem, createItem, modifiedItem, wordCountItem, statsItem];
  }

  camelToSentence(value) {
    let result = value.replace( /([A-Z])/g, " $1" );
    let finalResult = result.charAt(0).toUpperCase() + result.slice(1);
    
    return finalResult;
  }
}

/**
 * Data provider for the TreeView containing the stories stored in
 * the database. The tree follows the pattern:
 * 
 *  story1
 *  |-- version1
 *  |-- version2
 *  ...
 *  story2
 *  |-- version1
 */
class StoryDataProvider {
  /**
   * 
   * @param {Manager} manager the current Manager instance
   */
  constructor(manager) {
    this.manager = manager;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  /**
   * Inherited method from TreeDataProvider
   * @param {TreeItem} element 
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * Inherited method from TreeDataProvider
   * @param {TreeItem} element 
   */
  getChildren(element) {
    if (element) {
      return Promise.resolve(this.getVersions(element.story));
    } else {
      return Promise.resolve(this.getStories());
    }
  }

  /**
   * Refresh the view after a change
   */
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get all stories from database and store them in StoryItem objects.
   */
  getStories() {
    const stories = [];

    this.manager.db.getAllStories('created').forEach((story) => {
      const versionNames = story.versions.map((v) => {
        return this.manager.db.getVersionById(v).name;
      });

      stories.push(new StoryItem(story, versionNames, vscode.TreeItemCollapsibleState.Collapsed));
    });

    return stories;
  }

  /**
   * Get all version for a given story
   * @param {Object} storyObj story object read from database
   */
  getVersions(storyObj) {    
    const versions = [];

    let simpleStoryObj = { ...storyObj };
    delete simpleStoryObj.versions;
    
    this.manager.db.getVersionsByStory(storyObj.id).forEach((versionObj) => {
      versions.push(new VersionItem(versionObj, simpleStoryObj, vscode.TreeItemCollapsibleState.None));
    });

    return versions;
  }
}

class BackupHistoryProvider {
  constructor(backupHistory) {
    this.history = backupHistory;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  /**
   * Inherited method from TreeDataProvider
   * @param {TreeItem} element 
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * Inherited method from TreeDataProvider
   * @param {TreeItem} element 
   */
  getChildren(element) {
    if (element) {

    } else {
      return Promise.resolve(this.getBackupEntries());      
    }
  }

  /**
   * Refresh the view after a change
   */
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Format backup entries from database.
   */
  getBackupEntries() {
    const backupEntries = [];

    this.history.forEach((story) => {
      backupEntries.push(new BackupEntryItem(story));
    });

    return backupEntries;
  }
}

/**
 * Visible story item in the TreeView
 */
class StoryItem extends vscode.TreeItem {
  constructor(storyObj, versionNames, collapsibleState) {
    super(storyObj.title, collapsibleState);

    this.story = storyObj
    this.label = storyObj.title;
    this.contextValue = 'story-item';
    this.collapsibleState = collapsibleState;
    this.versionNames = versionNames;

    const iconName = this.story.title[0].toLowerCase() + '.svg';
    this.iconPath = {
      light: resources.getResourcePathByName('resources/light/' + iconName),
      dark: resources.getResourcePathByName('resources/dark/' + iconName),
    };
  }

  get tooltip() {
    return `Created ${dateformat(new Date(this.story.created), 'dddd, mmmm dS, yyyy')}`;
  }

  get description() {
    let indicator = '';

    if (this.versionNames.length > 0) {
      if (this.versionNames.includes(Version.REVISION)) {
        indicator = '○';
      }

      if (this.versionNames.includes(Version.TRANSLATION)) {
        indicator = '●';
      }
    }

    return indicator;
  }
}

/**
 * Visible version item in the TreeView. Children of StoryItem.
 */
class VersionItem extends vscode.TreeItem {
  /**
   * 
   * @param {Object} versionObj version object
   * @param {Object} simpleStoryObj story object without the versions property
   * @param {vscode.TreeItemCollapsibleState} collapsibleState collapsible state of the tree item
   */
  constructor(versionObj, simpleStoryObj, collapsibleState) {
    super(versionObj.name, collapsibleState);

    this.version = versionObj;
    this.simpleStoryObj = simpleStoryObj;
    this.label = versionObj.name;
    this.contextValue = 'version-item';
    this.collapsibleState = collapsibleState;

    this.command = {
      command: 'babel.openVersion',
      arguments: [simpleStoryObj, this.version],
      title: "Open version"
    }

    this.iconPath = {
      light: resources.getResourcePathByName('resources/light/version-item.svg'),
      dark: resources.getResourcePathByName('resources/dark/version-item.svg'),
    };
  }

  get tooltip() {
    return `Created ${dateformat(new Date(this.version.created), 'dddd, mmmm dS, yyyy')}`;
  }

  get description() {
    return `${this.version.wordCount} words`;
  }
}

class BackupEntryItem extends vscode.TreeItem {
  constructor(backupEntry) {
    super(backupEntry.timestamp, vscode.TreeItemCollapsibleState.None);

    this.entry = backupEntry;
    this.label = `${new Date(backupEntry.timestamp).toLocaleDateString()}`
    this.tooltip = backupEntry.localPath;
  }

  get description() {
    let description = 'local';

    this.entry.cloudProviders.forEach((cp) => {
      description += `, ${cp}`;
    });

    return description;
  }
}

module.exports = {
  StoryDataProvider,
  VersionInfoProvider,
  BackupHistoryProvider,
};
