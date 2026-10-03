import {
  GITHUB_ACCESS_TOKEN_URL,
  GITHUB_API_VERSION,
  GITHUB_DEVICE_CODE_URL,
  GITHUB_USER_AGENT,
  accessTokenNeedsRefresh,
  buildIssueBody,
  isGitHubFeedbackUrl,
  parseAccessToken,
  parseDeviceCode,
  parseGitHubUser,
  refreshTokenExpired,
  statusFromAuth,
  validateFeedback,
  type FeedbackContext,
  type FeedbackErrorCode,
  type GitHubFeedbackStatus,
  type GitHubFeedbackUser,
  type ParsedAccessToken,
  type StoredGitHubAuth,
} from '../../shared/githubFeedback';

export type SignInEvent =
  | { type: 'success'; status: GitHubFeedbackStatus }
  | { type: 'error'; error: FeedbackErrorCode; detail?: string };

export type BeginSignInResult =
  | { ok: true; userCode: string; verificationUri: string; expiresIn: number }
  | { ok: false; error: FeedbackErrorCode; detail?: string };

export type SubmitFeedbackResult =
  | { ok: true; number: number; url: string }
  | { ok: false; error: FeedbackErrorCode; detail?: string };

export type StarStateResult =
  | { ok: true; starred: boolean; count?: number }
  | { ok: false; error: 'unauthenticated' | 'forbidden' | 'network' | 'unknown' };

export type GitHubFeedbackDeps = {
  clientId: string;
  owner: string;
  repo: string;
  fetchImpl: typeof fetch;
  loadAuth: () => StoredGitHubAuth | null;
  saveAuth: (auth: StoredGitHubAuth | null) => void;
  openExternal: (url: string) => Promise<void>;
  copyText: (text: string) => void;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  context: () => Omit<FeedbackContext, 'locale'>;
};

export class GitHubFeedbackClient {
  private flow = 0;
  private pollAbort: AbortController | null = null;
  private pending: { userCode: string; verificationUri: string; expiresAt: number } | null = null;

  constructor(private readonly deps: GitHubFeedbackDeps) {}

  status(): GitHubFeedbackStatus {
    this.dropExpiredPending();
    const base = statusFromAuth(this.configured, this.deps.loadAuth());
    if (!this.pending || base.authenticated) return base;
    return {
      ...base,
      pending: {
        userCode: this.pending.userCode,
        verificationUri: this.pending.verificationUri,
        expiresIn: Math.max(0, Math.ceil((this.pending.expiresAt - this.deps.now()) / 1000)),
      },
    };
  }

  async beginSignIn(onResult: (event: SignInEvent) => void): Promise<BeginSignInResult> {
    this.stopPolling();
    const flow = ++this.flow;
    this.pending = null;

    if (!this.clientId) return { ok: false, error: 'not_configured' };

    let payload: unknown;
    try {
      payload = await this.postForm(GITHUB_DEVICE_CODE_URL, { client_id: this.clientId });
    } catch {
      return { ok: false, error: 'network' };
    }
    if (!this.isCurrent(flow)) return { ok: false, error: 'unknown' };

    const parsed = parseDeviceCode(payload);
    if ('error' in parsed) {
      return {
        ok: false,
        error: parsed.error === 'network' ? 'network' : oauthError(parsed.error),
        detail: parsed.error,
      };
    }

    const expiresIn = parsed.expires_in;
    this.pending = {
      userCode: parsed.user_code,
      verificationUri: parsed.verification_uri,
      expiresAt: this.deps.now() + expiresIn * 1000,
    };
    this.deps.copyText(parsed.user_code);
    if (isGitHubFeedbackUrl(parsed.verification_uri)) {
      try {
        await this.deps.openExternal(parsed.verification_uri);
      } catch {
        // The code stays on screen if the browser does not open.
      }
    }
    if (!this.isCurrent(flow)) return { ok: false, error: 'unknown' };

    const abort = new AbortController();
    this.pollAbort = abort;
    void this.poll(flow, parsed.device_code, parsed.interval, this.pending.expiresAt, abort.signal, onResult);

    return {
      ok: true,
      userCode: parsed.user_code,
      verificationUri: parsed.verification_uri,
      expiresIn,
    };
  }

  cancelSignIn(): GitHubFeedbackStatus {
    this.flow += 1;
    this.stopPolling();
    this.pending = null;
    return this.status();
  }

  signOut(): GitHubFeedbackStatus {
    this.cancelSignIn();
    this.deps.saveAuth(null);
    return this.status();
  }

  async submit(input: { title: string; description: string; locale: string }): Promise<SubmitFeedbackResult> {
    const validation = validateFeedback(input.title, input.description);
    if (validation) return { ok: false, error: validation };

    const token = await this.ensureAccessToken();
    if ('error' in token) return { ok: false, error: token.error };

    const body = buildIssueBody(input.description, {
      ...this.deps.context(),
      locale: input.locale,
    });

    let response: { status: number; payload: unknown };
    try {
      response = await this.api(`/repos/${encodeURIComponent(this.deps.owner)}/${encodeURIComponent(this.deps.repo)}/issues`, token.token, {
        method: 'POST',
        body: {
          title: input.title.trim(),
          body,
        },
      });
    } catch {
      return { ok: false, error: 'network' };
    }

    if (response.status === 401) {
      this.deps.saveAuth(null);
      return { ok: false, error: 'unauthenticated' };
    }
    if (response.status === 403) {
      return { ok: false, error: 'forbidden', detail: githubMessage(response.payload) };
    }
    if (response.status === 422) {
      return { ok: false, error: 'validation', detail: githubMessage(response.payload) };
    }
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: 'unknown', detail: githubMessage(response.payload) };
    }

    const created = parseCreatedIssue(response.payload);
    if (!created) return { ok: false, error: 'unknown' };
    const url = created.url || `https://github.com/${this.deps.owner}/${this.deps.repo}/issues/${created.number}`;
    return { ok: true, number: created.number, url };
  }

  async starState(): Promise<StarStateResult> {
    const token = await this.ensureAccessToken();
    if ('error' in token) return { ok: false, error: token.error === 'network' ? 'network' : 'unauthenticated' };

    const repoPath = `/repos/${encodeURIComponent(this.deps.owner)}/${encodeURIComponent(this.deps.repo)}`;
    let starredResponse: { status: number; payload: unknown };
    let repoResponse: { status: number; payload: unknown };
    try {
      [starredResponse, repoResponse] = await Promise.all([
        this.api(`/user/starred/${encodeURIComponent(this.deps.owner)}/${encodeURIComponent(this.deps.repo)}`, token.token),
        this.api(repoPath, token.token),
      ]);
    } catch {
      return { ok: false, error: 'network' };
    }

    if (starredResponse.status === 401) {
      this.deps.saveAuth(null);
      return { ok: false, error: 'unauthenticated' };
    }
    if (starredResponse.status === 403) return { ok: false, error: 'forbidden' };
    if (starredResponse.status !== 204 && starredResponse.status !== 404) {
      return { ok: false, error: 'unknown' };
    }

    return {
      ok: true,
      starred: starredResponse.status === 204,
      count: stargazerCount(repoResponse.payload),
    };
  }

  async setStarred(starred: boolean): Promise<StarStateResult> {
    const token = await this.ensureAccessToken();
    if ('error' in token) return { ok: false, error: token.error === 'network' ? 'network' : 'unauthenticated' };

    const path = `/user/starred/${encodeURIComponent(this.deps.owner)}/${encodeURIComponent(this.deps.repo)}`;
    let response: { status: number; payload: unknown };
    try {
      response = await this.api(path, token.token, { method: starred ? 'PUT' : 'DELETE', empty: true });
    } catch {
      return { ok: false, error: 'network' };
    }

    if (response.status === 401) {
      this.deps.saveAuth(null);
      return { ok: false, error: 'unauthenticated' };
    }
    if (response.status === 403) return { ok: false, error: 'forbidden' };
    if (response.status !== 204) return { ok: false, error: 'unknown' };
    return this.starState();
  }

  open(url: string): boolean {
    if (!isGitHubFeedbackUrl(url)) return false;
    void this.deps.openExternal(url);
    return true;
  }

  private get clientId(): string {
    return this.deps.clientId.trim();
  }

  private get configured(): boolean {
    return this.clientId.length > 0;
  }

  private stopPolling(): void {
    this.pollAbort?.abort();
    this.pollAbort = null;
  }

  private isCurrent(flow: number, signal?: AbortSignal): boolean {
    return this.flow === flow && !signal?.aborted;
  }

  private dropExpiredPending(): void {
    if (this.pending && this.pending.expiresAt <= this.deps.now()) {
      this.pending = null;
    }
  }

  private async poll(
    flow: number,
    deviceCode: string,
    intervalSeconds: number,
    deadline: number,
    signal: AbortSignal,
    onResult: (event: SignInEvent) => void,
  ): Promise<void> {
    let waitSeconds = Math.max(intervalSeconds, 1);
    while (this.isCurrent(flow, signal)) {
      await this.deps.sleep(waitSeconds * 1000, signal);
      if (!this.isCurrent(flow, signal)) return;
      if (this.deps.now() >= deadline) {
        this.pending = null;
        onResult({ type: 'error', error: 'expired_token' });
        return;
      }

      let payload: unknown;
      try {
        payload = await this.postForm(GITHUB_ACCESS_TOKEN_URL, {
          client_id: this.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });
      } catch {
        if (!this.isCurrent(flow, signal)) return;
        this.pending = null;
        onResult({ type: 'error', error: 'network' });
        return;
      }
      if (!this.isCurrent(flow, signal)) return;

      const parsed = parseAccessToken(payload);
      if (parsed.kind === 'pending') continue;
      if (parsed.kind === 'slow_down') {
        waitSeconds = parsed.interval ?? waitSeconds + 5;
        continue;
      }
      if (parsed.kind === 'error') {
        this.pending = null;
        onResult({ type: 'error', error: parsed.error, detail: parsed.detail });
        return;
      }

      await this.completeSignIn(flow, signal, parsed.token, onResult);
      return;
    }
  }

  private async completeSignIn(
    flow: number,
    signal: AbortSignal,
    token: ParsedAccessToken,
    onResult: (event: SignInEvent) => void,
  ): Promise<void> {
    let userPayload: { status: number; payload: unknown };
    try {
      userPayload = await this.api('/user', token.accessToken);
    } catch {
      if (!this.isCurrent(flow, signal)) return;
      this.pending = null;
      onResult({ type: 'error', error: 'network' });
      return;
    }
    if (!this.isCurrent(flow, signal)) return;

    const user = parseGitHubUser(userPayload.payload);
    if (userPayload.status !== 200 || !user) {
      this.pending = null;
      onResult({ type: 'error', error: 'unknown' });
      return;
    }

    try {
      this.deps.saveAuth(this.authFromToken(user, token));
    } catch {
      this.pending = null;
      onResult({ type: 'error', error: 'encryption_unavailable' });
      return;
    }

    this.pending = null;
    onResult({ type: 'success', status: this.status() });
  }

  private async ensureAccessToken(): Promise<{ token: string } | { error: FeedbackErrorCode }> {
    const auth = this.deps.loadAuth();
    if (!auth) return { error: 'unauthenticated' };
    if (!accessTokenNeedsRefresh(auth, this.deps.now())) return { token: auth.accessToken };
    if (refreshTokenExpired(auth, this.deps.now())) {
      this.deps.saveAuth(null);
      return { error: 'unauthenticated' };
    }

    let payload: unknown;
    try {
      payload = await this.postForm(GITHUB_ACCESS_TOKEN_URL, {
        client_id: this.clientId,
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken ?? '',
      });
    } catch {
      return { error: 'network' };
    }

    const parsed = parseAccessToken(payload);
    if (parsed.kind !== 'token') {
      this.deps.saveAuth(null);
      return { error: 'unauthenticated' };
    }

    const next = this.authFromToken(auth.user, {
      ...parsed.token,
      refreshToken: parsed.token.refreshToken ?? auth.refreshToken,
      refreshExpiresIn: parsed.token.refreshExpiresIn,
    }, auth);
    try {
      this.deps.saveAuth(next);
    } catch {
      return { error: 'encryption_unavailable' };
    }
    return { token: next.accessToken };
  }

  private authFromToken(user: GitHubFeedbackUser, token: ParsedAccessToken, previous?: StoredGitHubAuth): StoredGitHubAuth {
    const now = this.deps.now();
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken ?? previous?.refreshToken,
      accessTokenExpiresAt: token.expiresIn != null ? now + token.expiresIn * 1000 : undefined,
      refreshTokenExpiresAt: token.refreshExpiresIn != null
        ? now + token.refreshExpiresIn * 1000
        : previous?.refreshTokenExpiresAt,
      user,
    };
  }

  private async postForm(url: string, params: Record<string, string>): Promise<unknown> {
    const response = await this.deps.fetchImpl(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': GITHUB_USER_AGENT,
      },
      body: JSON.stringify(params),
    });
    const payload = await readJson(response);
    if (!response.ok && !hasErrorField(payload)) {
      throw new Error(`GitHub request failed (${response.status})`);
    }
    return payload;
  }

  private async api(path: string, token: string, init?: { method?: string; body?: unknown; empty?: boolean }): Promise<{ status: number; payload: unknown }> {
    const response = await this.deps.fetchImpl(`https://api.github.com${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': GITHUB_USER_AGENT,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.empty ? { 'Content-Length': '0' } : {}),
      },
      body: init?.empty ? '' : init?.body ? JSON.stringify(init.body) : undefined,
    });
    return { status: response.status, payload: await readJson(response) };
  }
}

function oauthError(error: string): FeedbackErrorCode {
  if (error === 'access_denied') return 'access_denied';
  if (error === 'expired_token' || error === 'token_expired') return 'expired_token';
  if (error === 'device_flow_disabled') return 'device_flow_disabled';
  if (error === 'incorrect_client_credentials') return 'not_configured';
  return 'unknown';
}

function hasErrorField(payload: unknown): boolean {
  return Boolean(payload && typeof payload === 'object' && 'error' in payload);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function githubMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message.trim() : undefined;
}

function stargazerCount(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const count = (payload as { stargazers_count?: unknown }).stargazers_count;
  return typeof count === 'number' ? count : undefined;
}

function parseCreatedIssue(payload: unknown): { number: number; url: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { number?: unknown; html_url?: unknown };
  if (typeof record.number !== 'number') return null;
  return {
    number: record.number,
    url: typeof record.html_url === 'string' ? record.html_url : '',
  };
}
