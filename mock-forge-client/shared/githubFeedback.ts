export const GITHUB_FEEDBACK_OWNER = 'jvictororiz';
export const GITHUB_FEEDBACK_REPO = 'Mock-Forge';

/**
 * Public client ID of the MockForge GitHub App.
 * Not a secret. Device flow must be enabled, with Issues read and write.
 * The app has to be installed on jvictororiz/Mock-Forge.
 */
export const GITHUB_FEEDBACK_CLIENT_ID = 'Iv23lipzi3khRcksgkh4';

export const GITHUB_API_VERSION = '2026-03-10';
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_USER_AGENT = 'MockForge';

export const FEEDBACK_TITLE_MAX = 256;
export const FEEDBACK_DESCRIPTION_MAX = 65536;

export type FeedbackErrorCode =
  | 'not_configured'
  | 'network'
  | 'access_denied'
  | 'expired_token'
  | 'device_flow_disabled'
  | 'encryption_unavailable'
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'title_required'
  | 'description_required'
  | 'title_too_long'
  | 'description_too_long'
  | 'unknown';

export type FeedbackOs = {
  platform: string;
  release: string;
  arch: string;
};

export type FeedbackContext = {
  appVersion: string;
  electronVersion: string;
  os: FeedbackOs;
  locale: string;
};

export type GitHubFeedbackUser = {
  login: string;
  name: string | null;
  avatarUrl: string;
};

export type StoredGitHubAuth = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
  user: GitHubFeedbackUser;
};

export type GitHubDevicePrompt = {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
};

export type GitHubFeedbackStatus = {
  configured: boolean;
  authenticated: boolean;
  login?: string;
  name?: string | null;
  avatarUrl?: string;
  pending?: GitHubDevicePrompt;
};

export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

export type ParsedAccessToken = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
};

export type ParsedToken =
  | { kind: 'token'; token: ParsedAccessToken }
  | { kind: 'pending' }
  | { kind: 'slow_down'; interval?: number }
  | { kind: 'error'; error: FeedbackErrorCode; detail?: string };

export function osDisplayName(platform: string): string {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform;
}

export function buildIssueBody(description: string, context: FeedbackContext): string {
  const os = `${osDisplayName(context.os.platform)} ${context.os.release} (${context.os.arch})`;
  return [
    description.trim(),
    '',
    '---',
    '',
    `**MockForge** ${context.appVersion}`,
    `**Electron** ${context.electronVersion}`,
    `**OS** ${os}`,
    `**Locale** ${context.locale}`,
  ].join('\n');
}

export function validateFeedback(title: string, description: string): FeedbackErrorCode | null {
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  if (!trimmedTitle) return 'title_required';
  if (trimmedTitle.length > FEEDBACK_TITLE_MAX) return 'title_too_long';
  if (!trimmedDescription) return 'description_required';
  if (trimmedDescription.length > FEEDBACK_DESCRIPTION_MAX) return 'description_too_long';
  return null;
}

export function accessTokenNeedsRefresh(auth: StoredGitHubAuth, now: number): boolean {
  if (auth.accessTokenExpiresAt == null) return false;
  return auth.accessTokenExpiresAt - now <= 60_000;
}

export function refreshTokenExpired(auth: StoredGitHubAuth, now: number): boolean {
  if (!auth.refreshToken) return true;
  if (auth.refreshTokenExpiresAt == null) return false;
  return auth.refreshTokenExpiresAt <= now;
}

export function statusFromAuth(configured: boolean, auth: StoredGitHubAuth | null): GitHubFeedbackStatus {
  if (!auth) return { configured, authenticated: false };
  return {
    configured,
    authenticated: true,
    login: auth.user.login,
    name: auth.user.name,
    avatarUrl: auth.user.avatarUrl,
  };
}

export function normalizeOAuthError(error: string): FeedbackErrorCode {
  if (error === 'token_expired' || error === 'expired_token') return 'expired_token';
  if (error === 'access_denied') return 'access_denied';
  if (error === 'device_flow_disabled') return 'device_flow_disabled';
  if (error === 'incorrect_client_credentials') return 'not_configured';
  if (error === 'network') return 'network';
  return 'unknown';
}

export function parseDeviceCode(payload: unknown): DeviceCodeResponse | { error: string } {
  if (!payload || typeof payload !== 'object') return { error: 'network' };
  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string') return { error: record.error };
  if (
    typeof record.device_code !== 'string'
    || typeof record.user_code !== 'string'
    || typeof record.verification_uri !== 'string'
  ) {
    return { error: 'network' };
  }
  return {
    device_code: record.device_code,
    user_code: record.user_code,
    verification_uri: record.verification_uri,
    expires_in: typeof record.expires_in === 'number' ? record.expires_in : 900,
    interval: typeof record.interval === 'number' ? record.interval : 5,
  };
}

export function parseAccessToken(payload: unknown): ParsedToken {
  if (!payload || typeof payload !== 'object') return { kind: 'error', error: 'network' };
  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string') {
    if (record.error === 'authorization_pending') return { kind: 'pending' };
    if (record.error === 'slow_down') {
      return {
        kind: 'slow_down',
        interval: typeof record.interval === 'number' ? record.interval : undefined,
      };
    }
    return {
      kind: 'error',
      error: normalizeOAuthError(record.error),
      detail: record.error,
    };
  }
  if (typeof record.access_token !== 'string' || !record.access_token) {
    return { kind: 'error', error: 'unknown' };
  }
  return {
    kind: 'token',
    token: {
      accessToken: record.access_token,
      refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : undefined,
      expiresIn: typeof record.expires_in === 'number' ? record.expires_in : undefined,
      refreshExpiresIn: typeof record.refresh_token_expires_in === 'number'
        ? record.refresh_token_expires_in
        : undefined,
    },
  };
}

export function parseGitHubUser(payload: unknown): GitHubFeedbackUser | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.login !== 'string' || !record.login) return null;
  return {
    login: record.login,
    name: typeof record.name === 'string' ? record.name : null,
    avatarUrl: typeof record.avatar_url === 'string' ? record.avatar_url : '',
  };
}

export function isGitHubFeedbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return false;
    if (parsed.pathname === '/login/device') return true;
    const issuePrefix = `/${GITHUB_FEEDBACK_OWNER}/${GITHUB_FEEDBACK_REPO}/issues/`;
    return parsed.pathname.startsWith(issuePrefix) && parsed.pathname.length > issuePrefix.length;
  } catch {
    return false;
  }
}

export function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
