import { useAppStore } from '../stores/appStore';
import { useLocaleStore } from '../stores/localeStore';
import { ensureCurrentEnvironment } from './ensureEnvironment';
import type { CapturedRequest, MockKind } from '../types';
import { showToast } from './notify';

export async function createMockFromTraffic(
  request: CapturedRequest,
  kind: MockKind,
): Promise<void> {
  const env = await ensureCurrentEnvironment();
  if (!env) {
    showToast(useLocaleStore.getState().t.traffic.noEnvironmentForRecording, 'error');
    return;
  }

  const route = await window.mockforge.route.createFromRequest(request, kind);
  if (route) {
    useAppStore.getState().upsertRoute(route, kind);
  }
}

export async function createMocksFromTraffic(
  requests: CapturedRequest[],
  kind: MockKind,
): Promise<void> {
  for (const request of requests) {
    await createMockFromTraffic(request, kind);
  }
}

export async function mockSessionRecording(records: CapturedRequest[]): Promise<void> {
  if (records.length === 0) return;

  const env = await ensureCurrentEnvironment();
  if (!env) {
    showToast(useLocaleStore.getState().t.traffic.noEnvironmentForRecording, 'error');
    return;
  }

  const routes = await window.mockforge.route.createFullMocksFromRequests(records);
  if (routes.length > 0) {
    useAppStore.getState().upsertRoutes(routes);
  }
}

