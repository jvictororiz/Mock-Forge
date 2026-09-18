import { contextBridge, ipcRenderer } from 'electron';
import type { CapturedRequest } from '../shared/types';
import type { MockForgeAPI } from '../shared/mockforge-api';

const api: MockForgeAPI = {
  server: {
    status: () => ipcRenderer.invoke('server:status'),
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    onStopped: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { error?: string }) => callback(data);
      ipcRenderer.on('server:stopped', handler);
      return () => ipcRenderer.removeListener('server:stopped', handler);
    },
    onStatusChanged: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('server:status-changed', handler);
      return () => ipcRenderer.removeListener('server:status-changed', handler);
    },
  },
  traffic: {
    get: () => ipcRenderer.invoke('traffic:get'),
    clear: () => ipcRenderer.invoke('traffic:clear'),
    onUpdate: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, requests: CapturedRequest[]) => callback(requests);
      ipcRenderer.on('traffic:update', handler);
      return () => ipcRenderer.removeListener('traffic:update', handler);
    },
    exportInstabilityLogs: (recordId) => ipcRenderer.invoke('instability:export-logs', recordId),
  },
  environment: {
    list: () => ipcRenderer.invoke('environment:list'),
    get: (id) => ipcRenderer.invoke('environment:get', id),
    current: () => ipcRenderer.invoke('environment:current'),
    setCurrent: (id) => ipcRenderer.invoke('environment:set-current', id),
    create: (name, port) => ipcRenderer.invoke('environment:create', name, port),
    save: (env) => ipcRenderer.invoke('environment:save', env),
    delete: (id) => ipcRenderer.invoke('environment:delete', id),
    duplicate: (id, newName) => ipcRenderer.invoke('environment:duplicate', id, newName),
    rename: (id, name) => ipcRenderer.invoke('environment:rename', id, name),
    export: (id) => ipcRenderer.invoke('environment:export', id),
    import: () => ipcRenderer.invoke('environment:import'),
  },
  route: {
    createFromRequest: (captured, kind) => ipcRenderer.invoke('route:create-from-request', captured, kind),
    createFullMockFromRequest: (captured) => ipcRenderer.invoke('route:create-full-mock-from-request', captured),
    createFullMocksFromRequests: (capturedList) => ipcRenderer.invoke('route:create-full-mocks-from-requests', capturedList),
    previewExpectation: (route) => ipcRenderer.invoke('route:preview-expectation', route),
    execute: (route) => ipcRenderer.invoke('route:execute', route),
  },
  expectations: {
    sync: () => ipcRenderer.invoke('expectations:sync'),
  },
  adb: {
    list: () => ipcRenderer.invoke('adb:list'),
    connect: (address) => ipcRenderer.invoke('adb:connect', address),
    connectDevice: (deviceId) => ipcRenderer.invoke('adb:connect-device', deviceId),
    setup: () => ipcRenderer.invoke('adb:setup'),
  },
  mirror: {
    status: () => ipcRenderer.invoke('mirror:status'),
    start: (deviceId) => ipcRenderer.invoke('mirror:start', deviceId),
    stop: () => ipcRenderer.invoke('mirror:stop'),
    injectTouch: (input) => ipcRenderer.invoke('mirror:inject-touch', input),
    injectScroll: (input) => ipcRenderer.invoke('mirror:inject-scroll', input),
    injectText: (text) => ipcRenderer.invoke('mirror:inject-text', text),
    copyScreenshot: (pngBase64) => ipcRenderer.invoke('mirror:copy-screenshot', pngBase64),
    saveScreenshot: (pngBase64, defaultName) => ipcRenderer.invoke('mirror:save-screenshot', pngBase64, defaultName),
    copyRecording: (data, mimeType, defaultName) => ipcRenderer.invoke('mirror:copy-recording', data, mimeType, defaultName),
    saveRecording: (data, mimeType, defaultName) => ipcRenderer.invoke('mirror:save-recording', data, mimeType, defaultName),
    onChunk: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, chunk: Buffer) => {
        callback(Uint8Array.from(chunk));
      };
      ipcRenderer.on('mirror:chunk', handler);
      return () => ipcRenderer.removeListener('mirror:chunk', handler);
    },
    onState: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, status: import('../shared/types').MirrorStatus) => callback(status);
      ipcRenderer.on('mirror:state', handler);
      return () => ipcRenderer.removeListener('mirror:state', handler);
    },
  },
  mcp: {
    listClients: () => ipcRenderer.invoke('mcp:list-clients'),
    setup: (clientId) => ipcRenderer.invoke('mcp:setup', clientId),
    remove: (clientId) => ipcRenderer.invoke('mcp:remove', clientId),
    getManualConfig: () => ipcRenderer.invoke('mcp:get-manual-config'),
    isReady: () => ipcRenderer.invoke('mcp:is-ready'),
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check'),
    apply: () => ipcRenderer.invoke('updates:apply'),
    openUrl: (url) => ipcRenderer.invoke('updates:open-url', url),
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, percent: number | null) => callback(percent);
      ipcRenderer.on('updates:progress', handler);
      return () => ipcRenderer.removeListener('updates:progress', handler);
    },
  },
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    getRecords: (id, options) => ipcRenderer.invoke('sessions:getRecords', id, options),
    create: (options) => ipcRenderer.invoke('sessions:create', options),
    saveCurrent: (name, records, options) => ipcRenderer.invoke('sessions:saveCurrent', name, records, options),
    complete: (id) => ipcRenderer.invoke('sessions:complete', id),
    rename: (id, name, notes) => ipcRenderer.invoke('sessions:rename', id, name, notes),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id),
    export: (id) => ipcRenderer.invoke('sessions:export', id),
    import: () => ipcRenderer.invoke('sessions:import'),
    getActive: () => ipcRenderer.invoke('sessions:getActive'),
    startRecording: () => ipcRenderer.invoke('sessions:startRecording'),
    stopRecording: () => ipcRenderer.invoke('sessions:stopRecording'),
    compare: (sessionAId, sessionBId, options) => ipcRenderer.invoke('sessions:compare', sessionAId, sessionBId, options),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('mockforge', api);
