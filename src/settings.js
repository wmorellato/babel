const os = require('os');
const path = require('path');
const vscode = require('vscode');
const { CloudProviders, Period } = require('./backup');

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

function getBackupOptions() {
  const localBackupPath = vscode.workspace.getConfiguration('stories.backup.localBackup').get('path');
  const backupPeriod = vscode.workspace.getConfiguration('stories.backup').get('period');
  const isDriveEnabled = vscode.workspace.getConfiguration('stories.backup.cloudBackup').get('googleDrive');
  
  const options = {
    providers: {
      cloud: [],
    },
  };

  
  try {
    if (!localBackupPath || localBackupPath === 'null') {
      options.providers.local = path.join(os.homedir(), 'Documents', 'BabelWorkspaceBackups');
      console.log(options.providers.local);
    }
  } catch (e) {
    options.providers.local = undefined;
  }

  if (isDriveEnabled) {
    options.providers.cloud.push(CloudProviders.DRIVE);
  }

  switch (backupPeriod) {
    case 'daily':
      options.period = Period.DAILY;
      break;
    case 'weekly':
      options.period = Period.WEEKLY;
      break;
    case 'monthly':
      options.period = Period.MONTHLY;
      break;
  }

  return options;
}

module.exports = {
  getWorkspaceDir,
  setWorkspaceDir,
  isHardDeleteSet,
  getAuthorInfo,
  getBackupOptions,
};
