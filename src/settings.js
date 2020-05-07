const vscode = require('vscode');

function getWorkspaceDir() {
  let wsDir = vscode.workspace.getConfiguration('stories.workspace').get('location');
  return wsDir;
}

function setWorkspaceDir(workspaceDir) {
  if (workspaceDir.scheme !== 'file') {
    return;
  }

  vscode.workspace.getConfiguration('stories.workspace').update('location', workspaceDir.path, true);
}

function isHardDeleteSet() {
  return vscode.workspace.getConfiguration('stories.workspace').get('removeFiles');
}

module.exports = {
  getWorkspaceDir,
  setWorkspaceDir,
  isHardDeleteSet,
};
