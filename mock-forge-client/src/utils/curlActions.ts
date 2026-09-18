import { capturedRequestToCurl, routeToCurl } from '../../shared/curlUtils';
import type { CapturedRequest, Route } from '../types';
import { useAppStore } from '../stores/appStore';
import { useLocaleStore } from '../stores/localeStore';
import { showToast } from './notify';

function getProxyBaseUrl(): string | undefined {
  const { currentEnvironment, serverStatus } = useAppStore.getState();
  const port = currentEnvironment?.port ?? serverStatus.port;
  return port ? `http://localhost:${port}` : undefined;
}

export async function copyCapturedRequestCurl(request: CapturedRequest): Promise<void> {
  await copyCapturedRequestsCurl([request]);
}

export async function copyCapturedRequestsCurl(requests: CapturedRequest[]): Promise<void> {
  if (requests.length === 0) return;

  const command = requests
    .map((request) => capturedRequestToCurl(request, getProxyBaseUrl()))
    .join('\n\n');
  await navigator.clipboard.writeText(command);
  showToast(useLocaleStore.getState().t.traffic.copiedCurl, 'info');
}

export async function copyRouteCurl(route: Route): Promise<void> {
  const command = routeToCurl(route, getProxyBaseUrl());
  await navigator.clipboard.writeText(command);
  showToast(useLocaleStore.getState().t.traffic.copiedCurl, 'info');
}
