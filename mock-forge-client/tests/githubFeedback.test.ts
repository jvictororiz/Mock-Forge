import { describe, expect, it, vi } from 'vitest';
import { GitHubFeedbackClient } from '../electron/services/GitHubFeedbackService';
import {
  buildIssueBody,
  validateFeedback,
  type StoredGitHubAuth,
} from '../shared/githubFeedback';

const context = {
  appVersion: '0.7.26',
  electronVersion: '32.1.0',
  os: { platform: 'win32', release: '10.0.26200', arch: 'x64' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createClient(options?: {
  clientId?: string;
  now?: number;
  fetchImpl?: typeof fetch;
}) {
  let auth: StoredGitHubAuth | null = null;
  const opened: string[] = [];
  const copied: string[] = [];
  const client = new GitHubFeedbackClient({
    clientId: options?.clientId ?? 'Iv1.client',
    owner: 'jvictororiz',
    repo: 'Mock-Forge',
    fetchImpl: options?.fetchImpl ?? (async () => jsonResponse({})),
    loadAuth: () => auth,
    saveAuth: (next) => {
      auth = next;
    },
    openExternal: async (url) => {
      opened.push(url);
    },
    copyText: (text) => {
      copied.push(text);
    },
    sleep: async () => {},
    now: () => options?.now ?? 1_000,
    context: () => context,
  });
  return {
    client,
    opened,
    copied,
    readAuth: () => auth,
    setAuth: (next: StoredGitHubAuth | null) => {
      auth = next;
    },
  };
}

describe('buildIssueBody', () => {
  it('keeps the report and appends the app environment', () => {
    const body = buildIssueBody('  O proxy cai ao iniciar  ', {
      ...context,
      locale: 'pt',
    });

    expect(body.startsWith('O proxy cai ao iniciar')).toBe(true);
    expect(body).toContain('**MockForge** 0.7.26');
    expect(body).toContain('**Electron** 32.1.0');
    expect(body).toContain('**OS** Windows 10.0.26200 (x64)');
    expect(body).toContain('**Locale** pt');
  });
});

describe('validateFeedback', () => {
  it('requires a title and a description within GitHub limits', () => {
    expect(validateFeedback('  ', 'texto')).toBe('title_required');
    expect(validateFeedback('título', '   ')).toBe('description_required');
    expect(validateFeedback('título', 'texto')).toBeNull();
    expect(validateFeedback('a'.repeat(257), 'texto')).toBe('title_too_long');
  });
});

describe('GitHubFeedbackClient', () => {
  it('refuses to start sign-in when the GitHub App client id is missing', async () => {
    const { client } = createClient({ clientId: '  ' });
    const result = await client.beginSignIn(() => {});
    expect(result).toEqual({ ok: false, error: 'not_configured' });
  });

  it('signs in after the device code is approved and stores the GitHub user', async () => {
    let tokenCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/login/device/code')) {
        return jsonResponse({
          device_code: 'device',
          user_code: 'WDJB-MJHT',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        });
      }
      if (url.endsWith('/login/oauth/access_token')) {
        tokenCalls += 1;
        const body = JSON.parse(String(init?.body));
        expect(body.client_secret).toBeUndefined();
        if (tokenCalls === 1) return jsonResponse({ error: 'authorization_pending' });
        return jsonResponse({
          access_token: 'ghu_test',
          refresh_token: 'ghr_test',
          expires_in: 28800,
          refresh_token_expires_in: 15897600,
          token_type: 'bearer',
        });
      }
      if (url.endsWith('/user')) {
        return jsonResponse({ login: 'ada', name: 'Ada Lovelace', avatar_url: 'https://example.com/a.png' });
      }
      throw new Error(`unexpected ${url}`);
    });

    const { client, opened, copied, readAuth } = createClient({ fetchImpl });
    const done = new Promise((resolve) => {
      void client.beginSignIn((event) => resolve(event)).then((start) => {
        expect(start).toMatchObject({ ok: true, userCode: 'WDJB-MJHT' });
      });
    });

    await expect(done).resolves.toMatchObject({
      type: 'success',
      status: { authenticated: true, login: 'ada', name: 'Ada Lovelace' },
    });
    expect(opened).toEqual(['https://github.com/login/device']);
    expect(copied).toEqual(['WDJB-MJHT']);
    expect(readAuth()?.accessToken).toBe('ghu_test');
    expect(client.status().login).toBe('ada');
    expect(JSON.stringify(client.status())).not.toContain('ghu_test');
  });

  it('refreshes an expired token and publishes the issue as the signed-in user', async () => {
    const user = { login: 'ada', name: null, avatarUrl: '' };
    const { client, setAuth } = createClient({
      now: 500_000,
      fetchImpl: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/login/oauth/access_token')) {
          const body = JSON.parse(String(init?.body));
          expect(body.grant_type).toBe('refresh_token');
          expect(body.client_secret).toBeUndefined();
          return jsonResponse({
            access_token: 'ghu_new',
            refresh_token: 'ghr_new',
            expires_in: 28800,
            refresh_token_expires_in: 15897600,
            token_type: 'bearer',
          });
        }
        expect(url).toBe('https://api.github.com/repos/jvictororiz/Mock-Forge/issues');
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ghu_new');
        const issue = JSON.parse(String(init?.body));
        expect(issue.title).toBe('Proxy cai');
        expect(issue.body).toContain('**OS** Windows 10.0.26200 (x64)');
        expect(issue.body).toContain('**Locale** pt');
        return jsonResponse({
          number: 42,
          html_url: 'https://github.com/jvictororiz/Mock-Forge/issues/42',
        }, 201);
      }),
    });

    setAuth({
      accessToken: 'ghu_old',
      refreshToken: 'ghr_old',
      accessTokenExpiresAt: 1_000,
      refreshTokenExpiresAt: 9_000_000,
      user,
    });

    await expect(client.submit({
      title: ' Proxy cai ',
      description: 'Ao iniciar o servidor',
      locale: 'pt',
    })).resolves.toEqual({
      ok: true,
      number: 42,
      url: 'https://github.com/jvictororiz/Mock-Forge/issues/42',
    });
  });

  it('reports when GitHub refuses the issue', async () => {
    const { client, setAuth } = createClient({
      fetchImpl: async () => jsonResponse({ message: 'Resource not accessible by integration' }, 403),
    });
    setAuth({
      accessToken: 'ghu_test',
      user: { login: 'ada', name: null, avatarUrl: '' },
    });

    await expect(client.submit({
      title: 'Bug',
      description: 'Passos',
      locale: 'en',
    })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
      detail: 'Resource not accessible by integration',
    });
  });

  it('does not open addresses outside the feedback flow', () => {
    const { client } = createClient();
    expect(client.open('https://github.com/jvictororiz/Mock-Forge/issues/7')).toBe(true);
    expect(client.open('https://example.com')).toBe(false);
  });

  it('stars the repository for the signed-in user', async () => {
    let starred = false;
    const { client, setAuth } = createClient({
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith('/user/starred/jvictororiz/Mock-Forge')) {
          if ((init?.method ?? 'GET') === 'GET') {
            return new Response(null, { status: starred ? 204 : 404 });
          }
          expect(init?.method).toBe('PUT');
          expect(init?.body).toBe('');
          starred = true;
          return new Response(null, { status: 204 });
        }
        if (url.endsWith('/repos/jvictororiz/Mock-Forge')) {
          return jsonResponse({ stargazers_count: starred ? 4 : 3 });
        }
        throw new Error(url);
      },
    });
    setAuth({
      accessToken: 'ghu_test',
      user: { login: 'ada', name: null, avatarUrl: '' },
    });

    await expect(client.starState()).resolves.toEqual({ ok: true, starred: false, count: 3 });
    await expect(client.setStarred(true)).resolves.toEqual({ ok: true, starred: true, count: 4 });
  });
});
