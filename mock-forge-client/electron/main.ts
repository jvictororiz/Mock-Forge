import { app, BrowserWindow, ipcMain, dialog, screen, nativeImage, clipboard, Menu } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { MockServerProcessManager } from './services/MockServerProcessManager';
import { MockServerAdapter, routeToExpectation, upsertRouteFromCapturedRequest, createFullMockRouteFromCaptured, createFullMockRoutesFromCaptured, environmentToInterceptRoutes, environmentToProxyRequestMocks } from './services/MockServerAdapter';
import { EnvironmentStorage } from './services/EnvironmentStorage';
import { SessionStorage } from './services/SessionStorage';
import { checkJava, checkJar } from './services/javaCheck';
import { getLocalIpAddress } from './services/network';
import { ProxyProcessManager, getInternalPort } from './services/ProxyProcessManager';
import { executeRoute, restoreExecutionEnvironment } from './services/routeExecutor';
import { resolveRequestConsumer } from '../shared/consumerUtils';
import type { Environment, Route, CapturedRequest, MockKind } from '../shared/types';
import { logAdbReverse } from './adbReverseLog';
import { setupAdbReverse, removeAdbReverse, getAdbStatus, connectAdbDevice, setupReverseForDevice, listAdbDevices } from './services/adbReverse';
import { scrcpyMirrorService, getMirrorStatus } from './services/scrcpyMirror';
import { copyMediaFileToClipboard } from './utils/mirrorCaptureClipboard';
import { DEFAULT_PORT } from '../shared/constants';
import { prepareEnvironment, resolveUpstream } from '../shared/upstreamUtils';
import { dedupeTrafficRecords, buildTrafficFingerprint } from '../shared/trafficDedup';
import { createInstabilityRecord, hasTrafficInstability } from '../shared/trafficInstability';
import type { InstabilityKind } from '../shared/types';
import type { InstabilityServerSnapshot } from '../shared/instabilityLogTypes';
import { instabilityLog } from './services/InstabilityLogService';
import { startAdbDeviceTracker, stopAdbDeviceTracker } from './services/adbDeviceTracker';
import { compareSessions } from '../shared/sessionCompare';
import type { EnvironmentSnapshot } from '../shared/sessionTypes';
import { MOCKFORGE_REQUEST_ID_HEADER, MOCKFORGE_FORCED_EXECUTION_HEADER } from '../shared/mockforgeHeaders';
import {
  canExecuteMcpServer,
  getManualConfig,
  listDetectedClients,
  removeClient,
  setupClient,
} from './services/McpIntegrationService';
import type { McpClientId } from '../shared/mcpTypes';
import { applyAppUpdate, checkForAppUpdate, openReleaseUrl } from './services/AppUpdateService';

function getTraceId(request: CapturedRequest): string | undefined {
  return request.headers[MOCKFORGE_REQUEST_ID_HEADER]
    || request.headers['X-MockForge-Request-Id'];
}

let mainWindow: BrowserWindow | null = null;
const processManager = new MockServerProcessManager();
const tcpProxy = new ProxyProcessManager();
tcpProxy.setOnTrafficRecorded(() => {
  const latest = tcpProxy.getPassthroughTraffic().at(-1);
  if (latest && hasTrafficInstability(latest)) {
    void buildInstabilitySnapshot().then((snapshot) => {
      instabilityLog.appendFromTrafficRecord(latest, snapshot);
    });
  }
  void publishTrafficUpdate();
});
tcpProxy.setOnInstabilityLog((entry) => {
  instabilityLog.append(
    (entry.category as 'adb' | 'proxy' | 'request' | 'system') || 'proxy',
    entry.kind || 'connection_failed',
    entry.message || 'Proxy instability',
    {
      correlationId: entry.correlationId,
      details: entry.details,
    },
  );
});
const envStorage = new EnvironmentStorage();
const sessionStorage = new SessionStorage();
let currentEnvironment: Environment | null = null;
let trafficPollInterval: ReturnType<typeof setInterval> | null = null;
const TRAFFIC_POLL_ACTIVE_MS = 800;
const TRAFFIC_POLL_IDLE_MS = 2000;
let lastPublishedTrafficFingerprint = '';
let lastAppendedRecordIds = new Set<string>();
let trafficPollIntervalMs = TRAFFIC_POLL_ACTIVE_MS;
let adbPollInterval: ReturnType<typeof setInterval> | null = null;
const ADB_POLL_MS = 1000;
const ADB_PROACTIVE_REFRESH_POLLS = 5;
let adbPollCount = 0;
let adbReverseActive = false;
const instabilityEvents: CapturedRequest[] = [];
const MAX_INSTABILITY_EVENTS = 50;
let adbReversedDevices: string[] = [];
let activeAdbDevice: string | null = null;

scrcpyMirrorService.onChunk((chunk) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mirror:chunk', chunk);
  }
});

scrcpyMirrorService.onStatus((status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mirror:state', status);
  }
});

function notifyServerStatusChanged(): void {
  if (mainWindow) {
    mainWindow.webContents.send('server:status-changed');
  }
}

async function buildServerStatus() {
  const javaCheck = checkJava();
  const port = getPublicPort();
  const adb = getAdbStatus(port);
  const connectedDevices = adb.devices.filter((d) => d.state === 'device');
  const activeDevice = activeAdbDevice && connectedDevices.some((d) => d.id === activeAdbDevice)
    ? activeAdbDevice
    : connectedDevices.find((d) => d.reverseActive)?.id ?? connectedDevices[0]?.id ?? null;

  return {
    running: isServerRunning(),
    port,
    healthy: isServerRunning() && await processManager.isHealthy(),
    javaAvailable: javaCheck.available,
    javaVersion: javaCheck.version,
    javaSource: javaCheck.source,
    jarAvailable: checkJar(),
    localIp: getLocalIpAddress(),
    lastError: processManager.getLastError(),
    proxyRequestCount: tcpProxy.isRunning() ? tcpProxy.getRequestCount() : 0,
    adbAvailable: adb.available,
    adbDevices: adb.devices,
    adbReverseActive,
    activeAdbDevice: activeDevice,
    deviceBaseUrl: adbReverseActive ? `http://localhost:${port}` : null,
  };
}

async function buildInstabilitySnapshot(): Promise<InstabilityServerSnapshot> {
  const status = await buildServerStatus();
  return {
    running: status.running,
    port: status.port,
    healthy: status.healthy,
    proxyRequestCount: status.proxyRequestCount,
    proxyActiveConnections: tcpProxy.getActiveConnections(),
    adbReverseActive: status.adbReverseActive,
    adbDevices: status.adbDevices.map((device) => ({
      id: device.id,
      state: device.state,
      reverseActive: device.reverseActive,
    })),
    activeAdbDevice: status.activeAdbDevice,
    deviceBaseUrl: status.deviceBaseUrl,
    lastError: status.lastError,
  };
}

function syncAdbStatusToProxy(): void {
  void tcpProxy.setAdbStatus(adbReverseActive);
}

function recordInstabilityEvent(
  kind: InstabilityKind,
  message: string,
  details?: Record<string, unknown>,
): void {
  const record = createInstabilityRecord(kind, message, details);
  instabilityEvents.unshift(record);
  if (instabilityEvents.length > MAX_INSTABILITY_EVENTS) {
    instabilityEvents.length = MAX_INSTABILITY_EVENTS;
  }
  void buildInstabilitySnapshot().then((snapshot) => {
    instabilityLog.append('adb', kind, message, {
      correlationId: record.id,
      details: { ...details, serverSnapshot: snapshot },
    });
    instabilityLog.appendFromTrafficRecord(record, snapshot);
  });
  void publishTrafficUpdate();
}

async function ensureAdbReverse(forceRefresh = false): Promise<void> {
  if (!isServerRunning()) return;

  adbPollCount += 1;
  const shouldProactivelyRefresh = adbPollCount % ADB_PROACTIVE_REFRESH_POLLS === 0;

  const port = getPublicPort();
  const adb = getAdbStatus(port);
  if (!adb.available) return;

  const connectedIds = adb.devices.filter((d) => d.state === 'device').map((d) => d.id);
  const targets = [...new Set([
    ...(activeAdbDevice ? [activeAdbDevice] : []),
    ...adbReversedDevices,
    ...connectedIds,
  ])].filter((id) => connectedIds.includes(id));

  if (targets.length === 0) {
    if (adbReverseActive || activeAdbDevice) {
      logAdbReverse('no_devices_connected', {
        port,
        wasActive: adbReverseActive,
        previousDevices: adbReversedDevices,
        hint: 'in_flight_requests_may_fail_or_disconnect_until_a_device_reconnects',
      });
      recordInstabilityEvent(
        'adb_no_device',
        'No Android device connected — ADB reverse tunnel is inactive',
        { port, previousDevices: adbReversedDevices },
      );
      adbReverseActive = false;
      activeAdbDevice = null;
      notifyServerStatusChanged();
    }
    return;
  }

  const missingReverse = targets.filter((id) => !getReverseActiveForDevice(id, port));
  const allReversed = missingReverse.length === 0;

  if (adbReverseActive && allReversed && !forceRefresh && !shouldProactivelyRefresh) return;

  const hadActiveReverse = adbReverseActive;

  if (hadActiveReverse && missingReverse.length > 0) {
    logAdbReverse('reverse_lost', {
      port,
      missingDevices: missingReverse,
      activeDevices: targets.filter((id) => !missingReverse.includes(id)),
      previouslyReversed: adbReversedDevices,
      hint: 'adb_tunnel_dropped_requests_to_localhost_may_fail_until_restore',
    });
    recordInstabilityEvent(
      'adb_reverse_lost',
      'ADB reverse tunnel lost — mobile requests to localhost may fail until restored',
      { port, missingDevices: missingReverse },
    );
  }

  const result = await setupAdbReverse(port, targets);
  const wasActive = adbReverseActive;
  adbReverseActive = result.success;
  adbReversedDevices = result.devices;

  if (result.success && !activeAdbDevice && result.devices.length > 0) {
    activeAdbDevice = result.devices[0];
  }

  if (!result.success && (hadActiveReverse || missingReverse.length > 0)) {
    logAdbReverse('reverse_restore_failed', {
      port,
      targetDevices: targets,
      missingDevices: missingReverse,
      hadActiveReverse,
      error: result.error,
      hint: 'check_usb_wifi_adb_connection_and_reconnect_device',
    });
    recordInstabilityEvent(
      'adb_reverse_restore_failed',
      'Failed to restore ADB reverse tunnel',
      { port, error: result.error, missingDevices: missingReverse },
    );
  }

  if (result.success && hadActiveReverse && missingReverse.length > 0) {
    instabilityLog.append(
      'adb',
      'adb_reverse_restored',
      'ADB reverse tunnel restored',
      { details: { port, devices: result.devices } },
    );
  }

  if (result.success || wasActive !== adbReverseActive) {
    syncAdbStatusToProxy();
    notifyServerStatusChanged();
  }
}

function getReverseActiveForDevice(deviceId: string, port: number): boolean {
  return listAdbDevices(port).find((d) => d.id === deviceId)?.reverseActive ?? false;
}

function startAdbPolling(): void {
  stopAdbPolling();
  adbPollCount = 0;
  void ensureAdbReverse(true);
  adbPollInterval = setInterval(() => {
    void ensureAdbReverse();
  }, ADB_POLL_MS);
  startAdbDeviceTracker(() => {
    void ensureAdbReverse(true);
  });
}

function stopAdbPolling(): void {
  stopAdbDeviceTracker();
  if (adbPollInterval) {
    clearInterval(adbPollInterval);
    adbPollInterval = null;
  }
}

async function getAllTrafficRecords(): Promise<CapturedRequest[]> {
  if (!isServerRunning()) return [...instabilityEvents];
  const mockServerTraffic = enrichTraffic(await getAdapter().getRecordedRequests());
  const passthroughTraffic = enrichTraffic(tcpProxy.getPassthroughTraffic());
  return dedupeTrafficRecords([
    ...instabilityEvents,
    ...passthroughTraffic,
    ...mockServerTraffic,
  ]).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
}

function getPublicPort(): number {
  return currentEnvironment?.port ?? DEFAULT_PORT;
}

function reloadCurrentEnvironment(): Environment | null {
  if (!currentEnvironment) {
    currentEnvironment = envStorage.getDefaultEnvironment();
    return currentEnvironment;
  }
  const fresh = envStorage.get(currentEnvironment.id);
  currentEnvironment = fresh ? prepareEnvironment(fresh) : envStorage.getDefaultEnvironment();
  return currentEnvironment;
}

function applyEnvironment(env: Environment): Environment {
  const prepared = prepareEnvironment(env);
  currentEnvironment = prepared;
  return prepared;
}

function getAdapter(): MockServerAdapter {
  return new MockServerAdapter(`http://127.0.0.1:${getInternalPort(getPublicPort())}`);
}

function isServerRunning(): boolean {
  return processManager.isRunning() && tcpProxy.isRunning();
}

function resolveAppIconPath(): string {
  const candidates = [
    join(__dirname, '../resources/icon.png'),
    join(app.getAppPath(), 'resources/icon.png'),
    join(process.resourcesPath, 'icon.png'),
  ];
  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

function getAppIcon() {
  return nativeImage.createFromPath(resolveAppIconPath());
}

function applyAppIcon(): void {
  const icon = getAppIcon();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon);
  }
}

function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  // Free Cmd/Ctrl+R for Monaco find/replace; reload stays on Shift+R.
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+Alt+R' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1100,
    minHeight: 600,
    icon: getAppIcon(),
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 18 },
        }
      : {
          autoHideMenuBar: true,
        }),
    backgroundColor: '#1a1a1f',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.maximize();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function enrichTraffic(requests: Awaited<ReturnType<MockServerAdapter['getRecordedRequests']>>) {
  return requests.map((req) => {
    const traceId = req.headers['x-mockforge-request-id']
      || req.headers['X-MockForge-Request-Id'];
    const headers = req.forcedExecution
      ? { ...req.headers, [MOCKFORGE_FORCED_EXECUTION_HEADER]: '1' }
      : req.headers;
    const consumer = resolveRequestConsumer(headers, req.clientIp, req.userAgent);
    return {
      ...req,
      durationMs: req.durationMs ?? (traceId ? tcpProxy.getTiming(traceId) : undefined),
      clientIp: consumer.clientIp,
      userAgent: consumer.userAgent,
      consumerId: consumer.consumerId,
      consumerLabel: consumer.label,
      consumerPlatform: consumer.platform,
    };
  });
}

function buildEnvironmentSnapshot(env: Environment): EnvironmentSnapshot {
  return {
    name: env.name,
    upstreamUrl: env.upstreamUrl,
    routeCount: env.routes.length,
    activeRouteIds: env.routes.filter((r) => r.enabled !== false).map((r) => r.id),
  };
}

function startRecordingSession(env: Environment, flowName?: string): void {
  const existing = sessionStorage.getActiveRecording();
  if (existing) {
    sessionStorage.complete(existing.id);
  }

  sessionStorage.create({
    name: flowName ? undefined : sessionStorage.generateDefaultName(),
    environmentId: env.id,
    environmentName: env.name,
    flowName,
    environmentSnapshot: buildEnvironmentSnapshot(env),
  });
  lastAppendedRecordIds = new Set();
}

function finishRecordingSession(): import('../shared/sessionTypes').TrafficSessionMeta | null {
  const active = sessionStorage.getActiveRecording();
  if (!active) {
    lastAppendedRecordIds = new Set();
    return null;
  }
  const completed = sessionStorage.complete(active.id);
  lastAppendedRecordIds = new Set();
  return completed;
}

function appendNewRecordsToActiveSession(records: CapturedRequest[]): void {
  const active = sessionStorage.getActiveRecording();
  if (!active) return;

  const newRecords = records.filter((record) => !lastAppendedRecordIds.has(record.id));
  if (newRecords.length === 0) return;

  sessionStorage.appendRecords(active.id, newRecords);
  for (const record of newRecords) {
    lastAppendedRecordIds.add(record.id);
  }
}

async function publishTrafficUpdate(): Promise<void> {
  if (!isServerRunning() || !mainWindow) return;
  try {
    const mockServerTraffic = enrichTraffic(await getAdapter().getRecordedRequests());
    const passthroughTraffic = enrichTraffic(tcpProxy.getPassthroughTraffic());
    const allDeduped = dedupeTrafficRecords([
      ...instabilityEvents,
      ...passthroughTraffic,
      ...mockServerTraffic,
    ])
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    const merged = allDeduped.slice(0, 50);

    appendNewRecordsToActiveSession(allDeduped);

    const fingerprint = buildTrafficFingerprint(merged);
    if (fingerprint === lastPublishedTrafficFingerprint) {
      if (trafficPollIntervalMs === TRAFFIC_POLL_ACTIVE_MS) {
        rescheduleTrafficPolling(TRAFFIC_POLL_IDLE_MS);
      }
      return;
    }

    lastPublishedTrafficFingerprint = fingerprint;
    if (trafficPollIntervalMs !== TRAFFIC_POLL_ACTIVE_MS) {
      rescheduleTrafficPolling(TRAFFIC_POLL_ACTIVE_MS);
    }
    mainWindow.webContents.send('traffic:update', merged);
  } catch {
    // server may be stopping
  }
}

function rescheduleTrafficPolling(intervalMs: number): void {
  if (trafficPollIntervalMs === intervalMs && trafficPollInterval) return;
  trafficPollIntervalMs = intervalMs;
  stopTrafficPolling();
  trafficPollInterval = setInterval(() => {
    void publishTrafficUpdate();
  }, trafficPollIntervalMs);
}

function startTrafficPolling(): void {
  lastPublishedTrafficFingerprint = '';
  lastAppendedRecordIds = new Set();
  trafficPollIntervalMs = TRAFFIC_POLL_ACTIVE_MS;
  stopTrafficPolling();
  void publishTrafficUpdate();
  trafficPollInterval = setInterval(() => {
    void publishTrafficUpdate();
  }, trafficPollIntervalMs);
}

function stopTrafficPolling(): void {
  if (trafficPollInterval) {
    clearInterval(trafficPollInterval);
    trafficPollInterval = null;
  }
}

app.whenReady().then(() => {
  applyAppIcon();
  setupApplicationMenu();
  instabilityLog.setLogDirectory(app.getPath('logs'));
  currentEnvironment = envStorage.getDefaultEnvironment();

  processManager.setOnUnexpectedExit(async (code, stderr) => {
    stopTrafficPolling();
    stopAdbPolling();
    finishRecordingSession();
    await removeAdbReverse(getPublicPort());
    adbReverseActive = false;
    adbReversedDevices = [];
    activeAdbDevice = null;
    await tcpProxy.stop();
    if (mainWindow) {
      mainWindow.webContents.send('server:stopped', {
        error: `MockServer stopped unexpectedly (code ${code})${stderr ? `: ${stderr.slice(-200)}` : ''}`,
      });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  stopTrafficPolling();
  stopAdbPolling();
  await scrcpyMirrorService.stop();
  await removeAdbReverse(getPublicPort());
  await tcpProxy.stop();
  await processManager.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  stopTrafficPolling();
  stopAdbPolling();
  await scrcpyMirrorService.stop();
  await removeAdbReverse(getPublicPort());
  await tcpProxy.stop();
  await processManager.stop();
});

// --- IPC Handlers ---

ipcMain.handle('server:status', async () => buildServerStatus());

ipcMain.handle('adb:setup', async () => {
  if (!isServerRunning()) {
    return { success: false, error: 'Server is not running' };
  }
  const result = await setupAdbReverse(getPublicPort(), adbReversedDevices.length ? adbReversedDevices : undefined);
  adbReverseActive = result.success;
  adbReversedDevices = result.devices;
  if (result.success && result.devices[0]) {
    activeAdbDevice = result.devices[0];
  }
  notifyServerStatusChanged();
  return result;
});

ipcMain.handle('adb:list', async () => {
  return listAdbDevices(isServerRunning() ? getPublicPort() : undefined);
});

ipcMain.handle('adb:connect', async (_e, address: string) => {
  const result = await connectAdbDevice(address);
  notifyServerStatusChanged();
  return result;
});

ipcMain.handle('adb:connect-device', async (_e, deviceId: string) => {
  const port = getPublicPort();
  let devices = listAdbDevices(port);
  let target = devices.find((d) => d.id === deviceId);

  if (!target || target.state !== 'device') {
    const address = deviceId.includes(':') ? deviceId : `${deviceId}:5555`;
    const connectResult = await connectAdbDevice(address);
    if (!connectResult.success) return connectResult;
    await new Promise((r) => setTimeout(r, 600));
    devices = listAdbDevices(port);
    target = devices.find((d) => d.id === deviceId || d.id === address)
      ?? devices.find((d) => d.state === 'device' && d.id.includes(deviceId.split(':')[0]));
  }

  if (!target || target.state !== 'device') {
    return { success: false, error: `Device not ready: ${deviceId}` };
  }

  if (isServerRunning()) {
    const reverseResult = await setupReverseForDevice(port, target.id);
    if (!reverseResult.success) return reverseResult;
    if (!adbReversedDevices.includes(target.id)) {
      adbReversedDevices.push(target.id);
    }
    adbReverseActive = true;
  }

  activeAdbDevice = target.id;
  notifyServerStatusChanged();
  return { success: true, deviceId: target.id };
});

ipcMain.handle('mirror:status', async () => getMirrorStatus());

ipcMain.handle('mirror:start', async (_e, deviceId?: string) => {
  const devices = listAdbDevices(isServerRunning() ? getPublicPort() : undefined)
    .filter((device) => device.state === 'device');
  const target = deviceId
    ?? activeAdbDevice
    ?? devices.find((device) => device.reverseActive)?.id
    ?? devices[0]?.id;

  if (!target) {
    return { success: false, error: 'no device connected' };
  }

  return scrcpyMirrorService.start(target);
});

ipcMain.handle('mirror:stop', async () => {
  await scrcpyMirrorService.stop();
  return { success: true };
});

ipcMain.handle('mirror:inject-touch', async (_e, input) => {
  return scrcpyMirrorService.injectTouch(input);
});

ipcMain.handle('mirror:inject-scroll', async (_e, input) => {
  return scrcpyMirrorService.injectScroll(input);
});

ipcMain.handle('mirror:inject-text', async (_e, text: string) => {
  return scrcpyMirrorService.injectText(text);
});

function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

ipcMain.handle('mirror:copy-screenshot', async (_e, pngBase64: string) => {
  try {
    const image = nativeImage.createFromBuffer(Buffer.from(pngBase64, 'base64'));
    clipboard.writeImage(image);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy screenshot',
    };
  }
});

ipcMain.handle('mirror:save-screenshot', async (_e, pngBase64: string, defaultName?: string) => {
  const fileName = defaultName ?? `screenshot-${Date.now()}.png`;
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save screenshot',
    defaultPath: join(app.getPath('pictures'), 'MockForge', fileName),
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    ensureParentDirectory(result.filePath);
    writeFileSync(result.filePath, Buffer.from(pngBase64, 'base64'));
    return { success: true, path: result.filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save screenshot',
    };
  }
});

ipcMain.handle('mirror:save-recording', async (_e, data: ArrayBuffer, mimeType: string, defaultName?: string) => {
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const fileName = defaultName ?? `recording-${Date.now()}.${extension}`;
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Save recording',
    defaultPath: join(app.getPath('videos'), 'MockForge', fileName),
    filters: [
      { name: 'WebM', extensions: ['webm'] },
      { name: 'MP4', extensions: ['mp4'] },
    ],
  });
  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  try {
    ensureParentDirectory(result.filePath);
    writeFileSync(result.filePath, Buffer.from(data));
    return { success: true, path: result.filePath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save recording',
    };
  }
});

ipcMain.handle('mirror:copy-recording', async (_e, data: ArrayBuffer, mimeType: string, defaultName?: string) => {
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const fileName = defaultName ?? `recording-${Date.now()}.${extension}`;

  try {
    const tempDir = mkdtempSync(join(tmpdir(), 'mockforge-recording-'));
    const tempPath = join(tempDir, fileName);
    writeFileSync(tempPath, Buffer.from(data));
    copyMediaFileToClipboard(tempPath, mimeType);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy recording',
    };
  }
});

async function syncProxyRouting(env: Environment): Promise<void> {
  const upstream = resolveUpstream(env);
  await tcpProxy.setUpstream(upstream);
  await tcpProxy.setInterceptRoutes(environmentToInterceptRoutes(env));
  await tcpProxy.setRequestMockRoutes(environmentToProxyRequestMocks(env));
}

ipcMain.handle('server:start', async () => {
  const env = reloadCurrentEnvironment();
  const upstream = env ? resolveUpstream(env) : undefined;
  const publicPort = getPublicPort();
  const internalPort = getInternalPort(publicPort);

  const msResult = await processManager.start(internalPort);
  if (!msResult.success) return msResult;

  const proxyResult = await tcpProxy.start(publicPort, internalPort, upstream);
  if (!proxyResult.success) {
    await processManager.stop();
    return proxyResult;
  }

  if (env) {
    const syncedEnv = { ...env, upstream };
    await syncProxyRouting(syncedEnv);
    try {
      await getAdapter().syncEnvironment(syncedEnv, { clearLog: true });
    } catch (err) {
      await processManager.stop();
      await tcpProxy.stop();
      return { success: false, error: (err as Error).message };
    }
    await syncProxyRouting(syncedEnv);
    await ensureAdbReverse();
    syncAdbStatusToProxy();
    startTrafficPolling();
    startAdbPolling();
  }
  return { success: true };
});

ipcMain.handle('server:stop', async () => {
  const publicPort = getPublicPort();
  if (tcpProxy.getActiveConnections() > 0) {
    recordInstabilityEvent(
      'proxy_shutdown',
      'Proxy stopped while requests were still in progress',
      { activeConnections: tcpProxy.getActiveConnections(), port: publicPort },
    );
  }
  stopTrafficPolling();
  stopAdbPolling();
  finishRecordingSession();
  await scrcpyMirrorService.stop();
  await removeAdbReverse(publicPort);
  adbReverseActive = false;
  await tcpProxy.stop();
  await processManager.stop();
  MockServerAdapter.resetSyncState();
  return { success: true };
});

ipcMain.handle('traffic:get', async () => {
  if (!isServerRunning()) return [];
  const mockServerTraffic = enrichTraffic(await getAdapter().getRecordedRequests());
  const passthroughTraffic = enrichTraffic(tcpProxy.getPassthroughTraffic());
  return dedupeTrafficRecords([
    ...instabilityEvents,
    ...passthroughTraffic,
    ...mockServerTraffic,
  ])
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, 50);
});

ipcMain.handle('traffic:clear', async () => {
  if (isServerRunning()) {
    await getAdapter().clearRequestLog();
    tcpProxy.clearPassthroughTraffic();
    instabilityEvents.length = 0;
    await publishTrafficUpdate();
  }
  return { success: true };
});

ipcMain.handle('instability:export-logs', async (_event, recordId: string) => {
  const allTraffic = await getAllTrafficRecords();
  const record = allTraffic.find((item) => item.id === recordId);
  if (!record || !hasTrafficInstability(record)) {
    return { success: false, error: 'Instability record not found' };
  }

  const bundle = instabilityLog.buildExportBundle(
    record,
    allTraffic,
    await buildInstabilitySnapshot(),
    {
      version: app.getVersion(),
      platform: process.platform,
    },
  );

  const safePath = (record.path || 'instability').replace(/[^\w.-]+/g, '_').slice(0, 80);
  const defaultName = `mockforge-instability-${safePath}-${record.timestamp.replace(/[:.]/g, '-')}.json`;
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }

  writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), 'utf8');

  const logFilePath = join(app.getPath('logs'), 'instability.log');
  if (existsSync(logFilePath)) {
    const logTail = readFileSync(logFilePath, 'utf8').split('\n').slice(-200).join('\n');
    writeFileSync(
      result.filePath.replace(/\.json$/i, '.log.txt'),
      logTail,
      'utf8',
    );
  }

  return { success: true, filePath: result.filePath };
});

ipcMain.handle('environment:list', () => envStorage.list());

ipcMain.handle('environment:get', (_e, id: string) => envStorage.get(id));

ipcMain.handle('environment:current', () => reloadCurrentEnvironment());

ipcMain.handle('environment:set-current', async (_e, id: string) => {
  const env = envStorage.get(id);
  if (!env) return null;
  const prepared = applyEnvironment(env);
  if (processManager.isRunning()) {
    const upstream = resolveUpstream(prepared);
    const synced = { ...prepared, upstream };
    await getAdapter().syncEnvironment(synced);
    await syncProxyRouting(synced);
  }
  return prepared;
});

ipcMain.handle('environment:create', (_e, name: string, port?: number) => {
  const env = envStorage.create(name, port);
  currentEnvironment = env;
  return env;
});

ipcMain.handle('environment:save', async (_e, env: Environment) => {
  const prepared = applyEnvironment(env);
  envStorage.save(prepared);
  if (processManager.isRunning()) {
    const upstream = resolveUpstream(prepared);
    const synced = { ...prepared, upstream };
    await getAdapter().syncEnvironment(synced);
    await syncProxyRouting(synced);
  }
  return prepared;
});

ipcMain.handle('environment:delete', (_e, id: string) => {
  envStorage.delete(id);
  if (currentEnvironment?.id === id) {
    currentEnvironment = envStorage.getDefaultEnvironment();
  }
  return currentEnvironment;
});

ipcMain.handle('environment:duplicate', (_e, id: string, newName?: string) => {
  return envStorage.duplicate(id, newName);
});

ipcMain.handle('environment:rename', async (_e, id: string, name: string) => {
  const env = envStorage.get(id);
  if (!env) return null;
  env.name = name;
  envStorage.save(env);
  if (currentEnvironment?.id === id) currentEnvironment = env;
  return env;
});

ipcMain.handle('environment:export', async (_e, id: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Environment',
    defaultPath: `${envStorage.get(id)?.name || 'environment'}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  return envStorage.exportEnv(id, result.filePath);
});

ipcMain.handle('environment:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import Environment',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return envStorage.importEnv(result.filePaths[0]);
});

ipcMain.handle('route:create-from-request', async (_e, captured: CapturedRequest, kind: MockKind = 'response') => {
  if (!currentEnvironment) return null;

  const route = upsertRouteFromCapturedRequest(currentEnvironment.routes, captured, kind);
  const routes = currentEnvironment.routes.some((r) => r.id === route.id)
    ? currentEnvironment.routes.map((r) => (r.id === route.id ? route : r))
    : [...currentEnvironment.routes, route];

  currentEnvironment = { ...currentEnvironment, routes };
  envStorage.save(currentEnvironment);

  if (processManager.isRunning()) {
    await getAdapter().syncEnvironment(currentEnvironment);
  }
  return route;
});

ipcMain.handle('route:create-full-mock-from-request', async (_e, captured: CapturedRequest) => {
  if (!currentEnvironment) return null;

  const route = createFullMockRouteFromCaptured(currentEnvironment.routes, captured);
  const routes = currentEnvironment.routes.some((r) => r.id === route.id)
    ? currentEnvironment.routes.map((r) => (r.id === route.id ? route : r))
    : [...currentEnvironment.routes, route];

  currentEnvironment = { ...currentEnvironment, routes };
  envStorage.save(currentEnvironment);

  if (processManager.isRunning()) {
    await getAdapter().syncEnvironment(currentEnvironment);
  }
  return route;
});

ipcMain.handle('route:create-full-mocks-from-requests', async (_e, capturedList: CapturedRequest[]) => {
  if (!currentEnvironment) return [];

  const { routes, added } = createFullMockRoutesFromCaptured(currentEnvironment.routes, capturedList);
  currentEnvironment = { ...currentEnvironment, routes };
  envStorage.save(currentEnvironment);

  if (processManager.isRunning()) {
    await getAdapter().syncEnvironment(currentEnvironment);
  }
  return added;
});

ipcMain.handle('route:preview-expectation', (_e, route: Route) => {
  return routeToExpectation(route);
});

ipcMain.handle('route:execute', async (_e, routeInput: Route) => {
  if (!isServerRunning()) {
    return { success: false, error: 'Server is not running. Start the server first.' };
  }

  const env = reloadCurrentEnvironment();
  if (!env) {
    return { success: false, error: 'No environment loaded' };
  }

  const route = env.routes.some((item) => item.id === routeInput.id)
    ? { ...env.routes.find((item) => item.id === routeInput.id)!, ...routeInput }
    : routeInput;

  const deps = {
    port: getPublicPort(),
    adapter: getAdapter(),
    syncProxyRouting: syncProxyRouting,
  };

  try {
    const result = await executeRoute(route, env, deps);

    if (result.success && result.requestId) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await publishTrafficUpdate();

      const mockServerTraffic = enrichTraffic(await getAdapter().getRecordedRequests());
      const passthroughTraffic = enrichTraffic(tcpProxy.getPassthroughTraffic());
      const record = dedupeTrafficRecords([...passthroughTraffic, ...mockServerTraffic])
        .find((item) => item.id === result.requestId || getTraceId(item) === result.requestId);

      return {
        success: true,
        requestId: result.requestId,
        record: record ? { ...record, forcedExecution: true } : undefined,
      };
    }

    return result;
  } finally {
    await restoreExecutionEnvironment(env, deps);
  }
});

ipcMain.handle('expectations:sync', async () => {
  if (!currentEnvironment || !isServerRunning()) return;
  await getAdapter().syncEnvironment(currentEnvironment);
});

ipcMain.handle('sessions:list', () => sessionStorage.list());

ipcMain.handle('sessions:get', (_e, id: string) => sessionStorage.get(id));

ipcMain.handle('sessions:getRecords', (_e, id: string, options?: { offset?: number; limit?: number }) => {
  return sessionStorage.getRecords(id, options);
});

ipcMain.handle('sessions:create', (_e, options: {
  name?: string;
  environmentId: string;
  environmentName: string;
  flowName?: string;
  primaryPlatform?: import('../shared/consumerUtils').ConsumerPlatform;
  environmentSnapshot?: EnvironmentSnapshot;
}) => {
  const existing = sessionStorage.getActiveRecording();
  if (existing) {
    sessionStorage.complete(existing.id);
  }

  const env = reloadCurrentEnvironment();
  return sessionStorage.create({
    ...options,
    environmentSnapshot: options.environmentSnapshot
      ?? (env ? buildEnvironmentSnapshot(env) : undefined),
  });
});

ipcMain.handle('sessions:saveCurrent', (_e, name: string, records: CapturedRequest[], options?: {
  flowName?: string;
  primaryPlatform?: import('../shared/consumerUtils').ConsumerPlatform;
  notes?: string;
}) => {
  const env = reloadCurrentEnvironment();
  if (!env) return null;

  const session = sessionStorage.create({
    name,
    environmentId: env.id,
    environmentName: env.name,
    flowName: options?.flowName,
    primaryPlatform: options?.primaryPlatform,
    environmentSnapshot: buildEnvironmentSnapshot(env),
  });

  if (options?.notes) {
    sessionStorage.updateMeta(session.id, { notes: options.notes });
  }

  if (records.length > 0) {
    sessionStorage.appendRecords(session.id, records);
  }

  sessionStorage.complete(session.id);
  return sessionStorage.get(session.id);
});

ipcMain.handle('sessions:complete', (_e, id: string) => sessionStorage.complete(id));

ipcMain.handle('sessions:rename', (_e, id: string, name: string, notes?: string) => {
  return sessionStorage.rename(id, name, notes);
});

ipcMain.handle('sessions:delete', (_e, id: string) => {
  sessionStorage.delete(id);
});

ipcMain.handle('sessions:export', async (_e, id: string) => {
  const session = sessionStorage.get(id);
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Session',
    defaultPath: `${session?.name || 'session'}.mockforge-session.json`,
    filters: [{ name: 'MockForge Session', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  return sessionStorage.exportSession(id, result.filePath);
});

ipcMain.handle('sessions:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import Session',
    filters: [{ name: 'MockForge Session', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return sessionStorage.importSession(result.filePaths[0]);
});

ipcMain.handle('sessions:getActive', () => sessionStorage.getActiveRecording());

ipcMain.handle('sessions:startRecording', () => {
  if (!isServerRunning()) {
    throw new Error('SERVER_NOT_RUNNING');
  }
  const env = reloadCurrentEnvironment();
  if (!env) {
    throw new Error('NO_ENVIRONMENT');
  }
  startRecordingSession(env);
  const active = sessionStorage.getActiveRecording();
  if (!active) {
    throw new Error('FAILED_TO_START_RECORDING');
  }
  return active;
});

ipcMain.handle('sessions:stopRecording', () => finishRecordingSession());

ipcMain.handle('sessions:compare', (_e, sessionAId: string, sessionBId: string, options?: {
  ignorePlatformNoise?: boolean;
  ignoreTiming?: boolean;
}) => {
  const sessionA = sessionStorage.get(sessionAId);
  const sessionB = sessionStorage.get(sessionBId);
  if (!sessionA || !sessionB) {
    throw new Error('One or both sessions not found');
  }
  return compareSessions(sessionA, sessionB, options);
});

ipcMain.handle('mcp:list-clients', () => listDetectedClients());

ipcMain.handle('mcp:setup', (_e, clientId: McpClientId) => setupClient(clientId));

ipcMain.handle('mcp:remove', (_e, clientId: McpClientId) => removeClient(clientId));

ipcMain.handle('mcp:get-manual-config', () => getManualConfig());

ipcMain.handle('mcp:is-ready', () => canExecuteMcpServer());

ipcMain.handle('updates:check', () => checkForAppUpdate());

ipcMain.handle('updates:open-url', (_e, url: string) => openReleaseUrl(url));

ipcMain.handle('updates:apply', async () => {
  try {
    return await applyAppUpdate(
      (percent) => {
        mainWindow?.webContents.send('updates:progress', percent);
      },
      async () => {
        stopTrafficPolling();
        stopAdbPolling();
        await scrcpyMirrorService.stop();
        await removeAdbReverse(getPublicPort());
        await tcpProxy.stop();
        await processManager.stop();
      },
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
