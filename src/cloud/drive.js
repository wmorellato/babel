const fs = require('fs');
const url = require('url');
const path = require('path');
const http = require('http');
const vscode = require('vscode');
const crypto = require('../crypto');
const open = require('open');
const enableDestroy = require('server-destroy');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const REDIRECT_URI_PORT = 13130
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_URI_PORT}/oauth2callback`;
const CLIENT_ID = '114380216450-bav1808su5on4b3oiad6i158t1fmmvki.apps.googleusercontent.com';
const TOKEN_FILE = '.token';

class DriveClient {
  constructor() {
    this.oAuth2Client = new OAuth2Client({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
    });

    this.boundTokensEventListener = this.handleTokenRefresh.bind(this);
    this.oAuth2Client.on('tokens', this.boundTokensEventListener);
    this.drive = undefined;
  }

  /**
   * Initialization utility method. Returns a Promise to be resolved upon
   * successfull setup.
   * @returns {Promise} resolved when client is ready to use
   */
  init() {
    return this.loadToken();
  }

  /**
   * After getting the auth token, setup the client to perform
   * Drive operations.
   */
  initClient() {
    this.drive = google.drive({
      version: 'v3',
      auth: this.oAuth2Client
    });
  }

  /**
   * Tries to load the stored token and requests a new one if something
   * goes wrong.
   * @returns {Promise} a Promise resolving when the client is ready
   */
  loadToken() {
    return new Promise((resolve) => {
      const folders = vscode.workspace.workspaceFolders;

      if (!folders || folders.length === 0) {
        throw new Error('Not a Babel workspace?');
      }

      const tokenPath = path.join(folders[0].uri.fsPath, TOKEN_FILE);
      const content = fs.readFileSync(tokenPath);

      resolve(content);
    })
    .then((content) => crypto.decrypt(content, vscode.env.machineId))
    .then((dec_content) => JSON.parse(dec_content.toString()))
    .catch(() => this.getAccessToken())
    .then((token) => { 
      this.token = token;
      this.saveTokens(token);
      this.oAuth2Client.setCredentials(token);
      this.initClient();
    })
    .catch((e) => {
      throw e;
    });
  }

  /**
   * Save the given tokens to the hard-drive
   * @param {Object} tokens token received from google-apis
   */
  saveTokens(tokens) {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders || folders.length === 0) {
      throw new Error('Not a Babel workspace?');
    }

    const tokenPath = path.join(folders[0].uri.fsPath, TOKEN_FILE);

    crypto.encrypt(JSON.stringify(tokens), vscode.env.machineId)
      .then((enc_content) => {
        fs.writeFileSync(tokenPath, enc_content);
      }).catch((e) => {
        throw new Error(e);
      });
  }

  /**
   * Opens a browser to ask user permission to access their
   * Drive account. If granted, the OAuth token will be sent
   * to a server listening on localhost.
   * 
   * TODO: passar pra Promise, ta meio bagunçado
   * @returns {Object} the token sent by Google
   */
  getAccessToken() {
    const authUrl = this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {      
        try {
          if (req.url.indexOf('/oauth2callback') > -1) {
            const qs = new url.URL(req.url, REDIRECT_URI).searchParams;
            const code = qs.get('code');
  
            res.end('Authentication successful');
            server.destroy();
  
            const response = await this.oAuth2Client.getToken(code);

            resolve(response.tokens);
          }
        } catch (e) {
          server.destroy();
          reject(e);
        }
      }).listen(REDIRECT_URI_PORT, () => {
        open(authUrl, { wait: false }).then((cp) => cp.unref());
      });
  
      enableDestroy(server);
    });
  }

  /**
   * Handle token events issued by the lib.
   * @param {Object} tokens new access token (or refresh token)
   *    received by the lib
   */
  handleTokenRefresh(tokens) {
    this.token = this.token || {};

    if (tokens.refresh_token) {
      this.token.refresh_token = tokens.refresh_token;
    }

    this.token.access_token = tokens.access_token;
    this.oAuth2Client.setCredentials(this.token);
    this.saveTokens(this.token);
  }

  /**
   * Update a backup file on Drive or creates a new one if none
   * was uploaded before.
   * @param {String} filePath path of the file to be uploaded
   * @param {String} name the name of the backup file
   * @returns {Promise} resolved when the file is successfully uploaded
   */
  uploadFile(filePath, name) {
    const media = {
      body: fs.createReadStream(filePath),
    };

    const requestBody = {
      name
    };

    return this.listBackups()
      .then((list) => {
        if (list.length > 0) {
          return this.drive.files.update({
            fileId: list[0].id,
            media,
            requestBody
          });
        }

        return this.drive.files.create({
          media,
          requestBody
        });
      });
  }

  /**
   * List all backup files stored in Drive. The name of
   * the backup files must begin with 'babel'.
   * @returns {Promise<Array>} list of backup files stored in Drive
   */
  listBackups() {
    return this.drive.files.list({
      q: 'name contains \'babel\'',
      spaces: 'drive',
    }).then((response) => {
      return response.data.files;
    });
  }
}

module.exports = {
  DriveClient,
};
