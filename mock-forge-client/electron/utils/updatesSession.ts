import { session, type Session } from 'electron';

const USER_AGENT = 'MockForge';
let cached: Session | null = null;

/** Chromium session so TLS uses the OS trust store, with a User-Agent GitHub accepts. */
export function updatesSession(): Session {
  if (!cached) {
    cached = session.fromPartition('mockforge-updates');
    cached.setUserAgent(USER_AGENT);
  }
  return cached;
}
