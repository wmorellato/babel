/**
 * Authorize Dropbox Cloud Backup
 * Handles OAuth2 PKCE flow for Dropbox authorization
 */

import * as http from 'http';
import * as crypto from 'crypto';
import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { TokenManager } from '../../services/tokenManager';
import { BabelSettings } from '../../services/babelSettings';
import { Logger } from '../../utils/logger';

const logger = new Logger('AuthorizeDropboxCommand');

export class AuthorizeDropboxCommand {
  /**
   * Generate PKCE code_verifier and code_challenge
   */
  private generatePKCEChallenge(): { codeVerifier: string; codeChallenge: string } {
    // Generate random code_verifier (43-128 chars, unreserved characters)
    const codeVerifier = crypto
      .randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Calculate code_challenge = BASE64URL(SHA256(codeVerifier))
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
  }

  /**
   * Get logo as base64 data URI
   */
  private getLogoDataUri(): string {
    try {
      const logoPath = path.join(
        path.dirname(__dirname),
        '..',
        '..',
        'resources',
        'logo-icon.png'
      );
      const logoBuffer = fs.readFileSync(logoPath);
      return `data:image/png;base64,${logoBuffer.toString('base64')}`;
    } catch (error) {
      logger.debug(`Failed to load logo: ${error}`);
      return '';
    }
  }

  /**
   * HTML template for success page
   */
  private getSuccessHTML(): string {
    const logoDataUri = this.getLogoDataUri();
    const logoImg = logoDataUri ?
      `<img src="${logoDataUri}" alt="Babel Logo" class="logo-image">` :
      '<div class="logo-placeholder">📝</div>';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Babel - Authorization Successful</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #D4C4B9 0%, #BBA899 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(84, 58, 50, 0.15);
            max-width: 500px;
            width: 100%;
            text-align: center;
            padding: 60px 40px;
          }
          .logo-image {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            display: block;
            border-radius: 8px;
          }
          .logo-placeholder {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            background: linear-gradient(135deg, #D4C4B9 0%, #BBA899 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 50px;
          }
          h1 {
            color: #3E2723;
            font-size: 28px;
            margin-bottom: 12px;
            font-weight: 600;
          }
          p {
            color: #6D4C41;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 12px;
          }
          .status {
            color: #5D4037;
            font-weight: 500;
            margin-top: 20px;
            font-size: 15px;
          }
          .info-box {
            background: #F5F1F0;
            border-left: 4px solid #A1887F;
            padding: 16px;
            margin-top: 24px;
            text-align: left;
            border-radius: 6px;
          }
          .info-box strong {
            color: #3E2723;
          }
          .info-box p {
            margin: 8px 0 0 0;
            font-size: 14px;
            color: #5D4037;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${logoImg}
          <h1>Authorization Successful!</h1>
          <p>Your Dropbox account has been connected to Babel.</p>
          <p class="status">✨ Cloud backups are now enabled</p>
          <div class="info-box">
            <strong>What happens next?</strong>
            <p>All your story backups will now be automatically saved to your Dropbox.</p>
          </div>
          <div class="info-box">
            <strong>Next step:</strong>
            <p>Close this window and return to VSCode. Your authorization is complete!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML template for error page
   */
  private getErrorHTML(errorMessage: string): string {
    const logoDataUri = this.getLogoDataUri();
    const logoImg = logoDataUri ?
      `<img src="${logoDataUri}" alt="Babel Logo" class="logo-image">` :
      '<div class="logo-placeholder">⚠️</div>';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Babel - Authorization Failed</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #E0B9AE 0%, #D4A19F 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(84, 58, 50, 0.15);
            max-width: 500px;
            width: 100%;
            text-align: center;
            padding: 60px 40px;
          }
          .logo-image {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            display: block;
            border-radius: 8px;
            opacity: 0.7;
          }
          .logo-placeholder {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            background: linear-gradient(135deg, #E0B9AE 0%, #D4A19F 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 50px;
          }
          h1 {
            color: #3E2723;
            font-size: 28px;
            margin-bottom: 12px;
            font-weight: 600;
          }
          p {
            color: #6D4C41;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 12px;
          }
          .error-message {
            background: #FFEBEE;
            border-left: 4px solid #C62828;
            padding: 16px;
            margin-top: 20px;
            text-align: left;
            border-radius: 6px;
            color: #3E2723;
            font-size: 14px;
            word-break: break-word;
          }
          .error-message strong {
            color: #C62828;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${logoImg}
          <h1>Authorization Failed</h1>
          <p>Unable to complete the Dropbox authorization process.</p>
          <div class="error-message"><strong>Error:</strong> ${this.escapeHtml(errorMessage)}</div>
          <p style="margin-top: 30px; font-size: 14px;">Please close this window and try again from VSCode.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Start local HTTP server to capture OAuth redirect
   */
  private startLocalServer(port: number): Promise<{ code: string; server: http.Server }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.getErrorHTML('Invalid request'));
          reject(new Error('Invalid request'));
          return;
        }

        const parsedUrl = url.parse(req.url, true);
        const code = parsedUrl.query.code as string;
        const error = parsedUrl.query.error as string;

        if (error) {
          const errorDescription = parsedUrl.query.error_description as string;
          const errorMsg = errorDescription || error;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.getErrorHTML(errorMsg));
          reject(new Error(`Authorization failed: ${errorMsg}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.getErrorHTML('No authorization code received'));
          reject(new Error('No authorization code received'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getSuccessHTML());
        resolve({ code, server });
      });

      server.listen(port, 'localhost', () => {
        logger.debug(`Local OAuth server started on port ${port}`);
      });

      server.on('error', reject);
    });
  }

  /**
   * Execute the authorization flow
   */
  async execute(
    clientId: string,
    redirectUri: string,
    tokenManager: TokenManager | null
  ): Promise<void> {
    if (!tokenManager) {
      throw new Error('TokenManager not initialized');
    }

    const redirectUrl = new url.URL(redirectUri);
    const port = parseInt(redirectUrl.port || '54831', 10);

    try {
      // Step 1: Generate PKCE challenge
      const { codeVerifier, codeChallenge } = this.generatePKCEChallenge();
      logger.debug('PKCE challenge generated');

      // Step 2: Build authorization URL
      const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
      authUrl.searchParams.append('client_id', clientId);
      authUrl.searchParams.append('redirect_uri', redirectUri);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('code_challenge', codeChallenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');
      authUrl.searchParams.append('token_access_type', 'offline');

      logger.debug('Authorization URL built');

      // Step 3: Start local server
      const serverPromise = this.startLocalServer(port);

      // Step 4: Open browser
      logger.info('Opening browser for Dropbox authorization');
      await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

      // Step 5: Wait for authorization code
      const { code, server } = await serverPromise;
      logger.debug('Authorization code received');

      // Step 6: Exchange code for token
      const tokenUrl = 'https://api.dropboxapi.com/oauth2/token';
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          code: code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      });

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };

      if (!tokenResponse.ok || tokenData.error) {
        throw new Error(
          `Token exchange failed: ${tokenData.error_description || tokenData.error}`
        );
      }

      // Step 7: Store tokens
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
      await tokenManager.acquireToken(
        'dropbox',
        tokenData.access_token || '',
        tokenData.refresh_token,
        expiresAt
      );

      logger.info('Dropbox authorization successful');

      // Step 8: Update settings
      await BabelSettings.setAuthorized(true);

      vscode.window.showInformationMessage(
        '✅ Dropbox authorization successful! Backups will now be uploaded to your Dropbox.'
      );

      server.close();
    } catch (error) {
      logger.error('Authorization failed', { error });
      vscode.window.showErrorMessage(`Authorization failed: ${error}`);
      throw error;
    }
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}
