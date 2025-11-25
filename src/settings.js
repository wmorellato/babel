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
  const localBackupPath = vscode.workspace.getConfiguration('backup.localBackup').get('path');
  const backupPeriod = vscode.workspace.getConfiguration('backup').get('period').toLowerCase();
  const isDriveEnabled = vscode.workspace.getConfiguration('backup.cloudBackup').get('googleDrive');
  
  const options = {
    providers: {
      cloud: [],
      local: localBackupPath,
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

function getPandocTemplatesLocation() {
  const pandocTemplatesLocation = vscode.workspace.getConfiguration('exporter').get('pandoc-templates');
  if (pandocTemplatesLocation && pandocTemplatesLocation !== 'null') {
    return pandocTemplatesLocation;
  }

  throw new Error('Local pandoc-templates location is not set in settings.');
}

function getKindleOptions() {
  const emailService = vscode.workspace.getConfiguration('kindle').get('emailService');
  const recEmailAddress = vscode.workspace.getConfiguration('kindle').get('recipientEmail');
  const emailAddress = vscode.workspace.getConfiguration('kindle').get('senderEmail');
  const emailPassword = vscode.workspace.getConfiguration('kindle').get('senderPassword');
  const exportFormat = vscode.workspace.getConfiguration('kindle').get('exportFormat');

  if (!recEmailAddress || !emailAddress || !emailPassword) {
    throw new Error('Kindle email settings are not properly configured.');
  }

  return {
    recipientEmail: recEmailAddress,
    service: emailService,
    auth: {
      user: emailAddress,
      pass: emailPassword,
    },
    exportFormat: exportFormat,
  };
}

module.exports = {
  getWorkspaceDir,
  setWorkspaceDir,
  isHardDeleteSet,
  getAuthorInfo,
  getBackupOptions,
  getPandocTemplatesLocation,
  getKindleOptions,
};
