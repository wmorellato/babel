const fs = require('fs');
const path = require('path');

/**
 * Settings manager to configure VSCode workspace settings for Babel
 */
class SettingsManager {
  constructor(workspaceDirectory) {
    this.workspaceDirectory = workspaceDirectory;
    this.vscodeDir = path.join(workspaceDirectory, '.vscode');
    this.settingsPath = path.join(this.vscodeDir, 'settings.json');
  }

  /**
   * Ensure .vscode directory exists
   */
  ensureVscodeDirectory() {
    if (!fs.existsSync(this.vscodeDir)) {
      fs.mkdirSync(this.vscodeDir, { recursive: true });
    }
  }

  /**
   * Read existing settings, or return empty object if none exist
   */
  readSettings() {
    if (!fs.existsSync(this.settingsPath)) {
      return {};
    }

    try {
      const content = fs.readFileSync(this.settingsPath, 'utf8');
      // Handle empty file or comments-only file
      const trimmed = content.trim();
      if (!trimmed || trimmed === '{}') {
        return {};
      }
      return JSON.parse(content);
    } catch (error) {
      console.error('Error reading VSCode settings:', error);
      // If we can't parse existing settings, return empty object
      // We don't want to overwrite potentially valid settings
      return null;
    }
  }

  /**
   * Write settings to settings.json
   */
  writeSettings(settings) {
    this.ensureVscodeDirectory();
    const content = JSON.stringify(settings, null, 2);
    fs.writeFileSync(this.settingsPath, content + '\n', 'utf8');
  }

  /**
   * Configure VSCode settings to prevent Git extension from monitoring story directories
   * This prevents the listener leak when having many git-based stories
   */
  configureGitSettings() {
    const currentSettings = this.readSettings();

    // If we couldn't read settings, don't modify them
    if (currentSettings === null) {
      console.warn('Could not read existing VSCode settings. Skipping Git configuration.');
      return false;
    }

    let modified = false;

    // Disable automatic git repository detection for nested repos
    // This prevents VSCode from monitoring all story git repos
    if (!currentSettings.hasOwnProperty('git.autoRepositoryDetection')) {
      currentSettings['git.autoRepositoryDetection'] = 'openEditors';
      modified = true;
    }

    // Add file watcher exclusions to reduce CPU usage
    if (!currentSettings.hasOwnProperty('files.watcherExclude')) {
      currentSettings['files.watcherExclude'] = {};
    }

    const watcherExclude = currentSettings['files.watcherExclude'];
    const exclusions = {
      '**/.git/objects/**': true,
      '**/.git/subtree-cache/**': true,
      '**/node_modules/*/**': true,
    };

    for (const [pattern, value] of Object.entries(exclusions)) {
      if (!watcherExclude.hasOwnProperty(pattern)) {
        watcherExclude[pattern] = value;
        modified = true;
      }
    }

    // Write settings if modified
    if (modified) {
      this.writeSettings(currentSettings);
      console.log('Configured VSCode settings to optimize Git performance');
      return true;
    }

    return false;
  }

  /**
   * Initialize workspace settings with Babel-specific configurations
   */
  initializeWorkspaceSettings() {
    return this.configureGitSettings();
  }
}

module.exports = {
  SettingsManager,
};
