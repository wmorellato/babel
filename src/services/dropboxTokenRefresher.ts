import { BabelSettings } from './babelSettings';
import { RefreshHandler } from './tokenManager';

export function createDropboxRefreshHandler(): RefreshHandler {
  return async (refreshToken: string) => {
    const clientId = BabelSettings.getBackupSetting<string>('dropbox.clientId') ?? '';
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!response.ok || !data.access_token) {
      throw new Error(`Dropbox token refresh failed: ${data.error ?? response.statusText}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 14400) * 1000),
    };
  };
}
