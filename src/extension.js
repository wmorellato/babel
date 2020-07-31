const vscode = require('vscode');
const resources = require('./vscode/resource-manager');
const { isBabelWorkspace, WorkspaceManager } = require('./vscode/workspace');
const { DriveClient } = require('./cloud/drive');


/**
 * This is to block any command when the current workspace is not a Babel
 * workspace.
 * @param {vscode.ExtensionContext} context extension context
 */
function redirectCommandsToError(context) {
  const showError = () => {
    vscode.window.showErrorMessage('Not a Babel workspace! Open VSCode on a Babel directory and try again.')
  };

  context.subscriptions.push(vscode.commands.registerCommand('babel.newStory', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.newVersion', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.openVersion', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.editVersionName', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.editStoryTitle', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.removeVersion', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.removeStory', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.refreshExplorer', showError));
  context.subscriptions.push(vscode.commands.registerCommand('babel.insertMetadata', showError));
}

/**
 * @param {vscode.ExtensionContext} context 
 */
async function activate(context) {
  const d = new DriveClient();

  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  // checking if this is a Babel workspace
  const check = await isBabelWorkspace(vscode.workspace.workspaceFolders[0].uri.fsPath);

  if (!check) {
    redirectCommandsToError(context);
    return;
  }

  // focus on our activity view
  await vscode.commands.executeCommand('workbench.view.extension.story-explorer');

  // init WorkspaceManager
  const workspace = new WorkspaceManager(context);

  // initializing resource manager
  resources.init(context);

  // listeners
  vscode.window.onDidChangeActiveTextEditor((textEditor) => workspace.onDidChangeEditor(textEditor));
  vscode.workspace.onDidChangeTextDocument((documentChangedEvent) => workspace.onDidDocumentChange(documentChangedEvent));
  vscode.workspace.onDidCloseTextDocument((textDocument) => workspace.onDidCloseDocument(textDocument));
  vscode.workspace.onWillSaveTextDocument((willSaveEvent) => workspace.onWillSaveDocument(willSaveEvent));

  // commands
  context.subscriptions.push(vscode.commands.registerCommand('babel.newStory', () => workspace.newStoryCommand()));
  context.subscriptions.push(vscode.commands.registerCommand('babel.newVersion', (node) => workspace.newVersionCommand(node)));
  context.subscriptions.push(vscode.commands.registerCommand('babel.openVersion', (storyId, version) => workspace.openVersionCommand(storyId, version)));
  context.subscriptions.push(vscode.commands.registerCommand('babel.editVersionName', (node) => workspace.editVersionNameCommand(node)));
  context.subscriptions.push(vscode.commands.registerCommand('babel.exportToTemplate', (node) => workspace.exportToTemplate(node)));
  context.subscriptions.push(vscode.commands.registerCommand('babel.editStoryTitle', (node) => workspace.editStoryTitle(node)));
  context.subscriptions.push(vscode.commands.registerCommand('babel.removeVersion', (node) => workspace.removeVersion(node)));
  context.subscriptions.push(vscode.commands.registerCommand('babel.removeStory', (node) => workspace.removeStory(node)));
  context.subscriptions.push(vscode.commands.registerCommand('babel.refreshExplorer', () => workspace.updateViews()));
  context.subscriptions.push(vscode.commands.registerCommand('babel.insertMetadata', () => workspace.insertMetadata()));
}

exports.activate = activate;

function deactivate() { }

module.exports = {
  activate,
  deactivate
}
