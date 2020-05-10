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

function getAuthorInfo() {
  const authorInfo = {};

  if (vscode.workspace.getConfiguration('stories.authorInformation').get('usePenName')) {
    authorInfo.author = vscode.workspace.getConfiguration('stories.authorInformation').get('penName');
  } else {
    authorInfo.author = vscode.workspace.getConfiguration('stories.authorInformation').get('name');
  }

  authorInfo.email = vscode.workspace.getConfiguration('stories.authorInformation').get('email');
  authorInfo.country = vscode.workspace.getConfiguration('stories.authorInformation').get('country');

  return authorInfo;
}

function isHardDeleteSet() {
  return vscode.workspace.getConfiguration('stories.workspace').get('removeFiles');
}

module.exports = {
  getWorkspaceDir,
  setWorkspaceDir,
  isHardDeleteSet,
  getAuthorInfo,
};
