import { session, type Session } from 'electron';

const USER_AGENT = 'MockForge';
let cached: Session | null = null;

/**
 * Chromium session so TLS uses the OS trust store.
 * Chromium drops a User-Agent set on net.request, and GitHub answers 403 without one.
 */
export function updatesSession(): Session {
  if (!cached) {
    cached = session.fromPartition('mockforge-updates');
    cached.setUserAgent(USER_AGENT);
    cached.webRequest.onBeforeSendHeaders((details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      for (const key of Object.keys(requestHeaders)) {
        if (key.toLowerCase() === 'user-agent') delete requestHeaders[key];
      }
      requestHeaders['User-Agent'] = USER_AGENT;
      callback({ requestHeaders });
    });
  }
  return cached;
}
