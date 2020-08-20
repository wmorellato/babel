const fs = require('fs');
const path = require('path');
const fsWalk = require('@nodelib/fs.walk');
const { DriveClient } = require('./cloud/drive');
const JSZip = require('jszip');

const DAY_MS = 24 * 60 * 60 * 1000;

const CloudProviders = {
  DRIVE: 'drive',
};

const Period = {
  DAILY: DAY_MS,
  WEEKLY: DAY_MS * 7,
  MONTHLY: DAY_MS * 7 * 4,
};

class BackupManager {
  /**
   * This class manages backup operations using the specified
   * providers. Currently supported providers are Google Drive and
   * local backups.
   * @param {String} workspaceDir Babel workspace directory used by Manager
   * @param {BabelDb} dbInstance Babel database instance
   */
  constructor(workspaceDir, dbInstance) {
    this.workspaceDirectory = workspaceDir;
    this.db = dbInstance;
    this.cloudProviders = [];
    this.cloudProviderNames = [];
  }

  /**
   * Initializes the manager.
   * @param {Object} options specify backup options
   * @param {Object} options.providers backup providers
   * @param {String} options.providers.local path in the local system to
   *    to store backups
   * @param {CloudProviders} options.providers.cloud list of cloud providers to upload
   *    backups.
   * @param {Period} options.period specifies the backup period
   * @returns {Promise} resolves when all providers are initialized
   */
  init(options) {
    return new Promise(async (resolve) => {
      options = options || {};

      this.period = options.period || Period.WEEKLY;

      if (!options.providers) {
        resolve();
      }
  
      if (options.providers.cloud) {
        await this.initCloudProviders(options.providers.cloud);
      }
  
      if (options.providers.local) {
        this.localBackupPath = options.providers.local; 
        await this.initLocalProvider();
      }
  
      await this.backupIfOlder();

      resolve();
    });
  }

  initLocalProvider() {
    return new Promise((resolve) => {
      if (!fs.existsSync(this.localBackupPath)
          || !fs.lstatSync(this.localBackupPath).isDirectory()) {
            fs.mkdirSync(this.localBackupPath, { recursive: true });
          }
        
      resolve();
    });
  }

  initCloudProviders(cloudProviders) {
    return new Promise(async (resolve) => {
      for (let cp of cloudProviders) {
        switch (cp) {
          case CloudProviders.DRIVE:
            const driveClient = new DriveClient();
            await driveClient.init();
            
            this.cloudProviders.push(driveClient);
            this.cloudProviderNames.push(cp);
            break;
          default:
            break;
        }
      }

      resolve();
    });
  }

  async backupIfOlder() {
    const lastScheduledBackup = Date.now() - this.period;
    const backupHistory = this.db.getBackupEntries();

    if (!backupHistory || !backupHistory[0] || backupHistory[0].timestamp < lastScheduledBackup) {
      await this.doBackup();
    }
  }

  /**
   * External function to trigger backup operation.
   */
  async doBackup() {
    const backupPath = await this.createBackup();
      
    for (let cp of this.cloudProviders) {
      await cp.uploadFile(backupPath, path.basename(backupPath));
    }

    this.db.insertBackupEntry({
      timestamp: Date.now(),
      localPath: backupPath,
      cloudProviders: this.cloudProviderNames,
    });
  }

  /**
   * Creates a backup file of the entire workspace, excluding the tokens
   * file.
   * @param {Object} options properties of the backup file
   * @param {String} options.outputPath the output path to save the backup file
   * @param {String} options.backupName name of the backup file, defaults to
   *    'babel-isoDate.backup.zip'
   * @returns {Promise<String>} the path of the created backup
   */
  createBackup(options) {
    options = options || {};

    return new Promise((resolve, reject) => {
      fsWalk.walk(this.workspaceDirectory, {
        basePath: '',
        entryFilter: (entry) => !entry.name.endsWith('.token'),
      }, (err, entries) => {
        if (err) {
          return reject(err);
        }

        resolve(entries);
      });
    }).then((entries) => {
      const outputPath = options.outputPath || this.localBackupPath;
      const backupFile = path.join(outputPath, `babel-${new Date().toISOString().split('T')[0]}.backup.zip`);
      const zip = new JSZip();

      entries.forEach((e) => {
        if (e.dirent.isFile()) {
          const stream = fs.createReadStream(path.join(this.workspaceDirectory, e.path));
          zip.file(e.path, stream);
        }
      });

      return new Promise((resolve, reject) => {
        zip
          .generateNodeStream({ type: 'nodebuffer', 'compression': 'DEFLATE' })
          .pipe(fs.createWriteStream(backupFile))
          .on('finish', () => resolve(backupFile))
          .on('error', () => { reject(); });
      });
    });
  }

  /**
   * Opens a backup file and extracts its contents in the Babel's current
   * working directory.
   * 
   * Caution: this method overrides local files. Should be used with
   * care.
   * 
   * @param {String} backupPath the location of the backup file. Only
   *    file locations supported for now.
   */
  openBackup(backupPath) {
    return new Promise(async (resolve) => {
      const zipData = fs.readFileSync(backupPath);
      const zip  = await JSZip.loadAsync(zipData);

      for (let entry of Object.keys(zip.files)) {
        const destPath = path.join(this.workspaceDirectory, entry);

        if (zip.files[entry].dir) {
          fs.mkdirSync(destPath, { recursive: true });
          continue;
        }

        const content = await zip.files[entry].async('nodebuffer');
        fs.writeFileSync(destPath, content);
      }

      resolve();
    });
  }
}

module.exports = {
  Period,
  CloudProviders,
  BackupManager,
}