import { create } from 'zustand';
import type { TrafficSessionMeta } from '../../shared/sessionTypes';
import type { SessionComparison, CompareOptions } from '../../shared/comparisonTypes';
import type { CapturedRequest } from '../types';
import { showToast } from '../utils/notify';
import { useLocaleStore } from './localeStore';
import { useAppStore } from './appStore';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';
import { mockSessionRecording } from '../utils/trafficActions';

type HistoryMode = 'empty' | 'session' | 'compare';

interface CompareSelection {
  sessionAId: string | null;
  sessionBId: string | null;
}

interface SessionState {
  sessions: TrafficSessionMeta[];
  activeSession: TrafficSessionMeta | null;
  viewingSessionId: string | null;
  viewingSession: TrafficSessionMeta | null;
  viewingRecords: CapturedRequest[];
  selectedRecordId: string | null;
  historyMode: HistoryMode;
  comparisonResult: SessionComparison | null;
  compareSelection: CompareSelection;
  selectedDiffPairKey: string | null;
  compareOptions: CompareOptions;
  pendingNameSessionId: string | null;
  pendingNameDefault: string;

  sessionsLoading: boolean;
  recordsLoading: boolean;
  comparisonLoading: boolean;
  activeLoading: boolean;
  recordingBusy: boolean;

  loadSessions: () => Promise<void>;
  refreshActiveSession: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  openNamingFlow: (sessionId: string, defaultName: string) => void;
  finishNamingSession: (name: string | null) => Promise<void>;
  openSession: (id: string) => Promise<void>;
  closeSessionView: () => void;
  enterCompareMode: () => void;
  selectForCompare: (slot: 'a' | 'b', sessionId: string | null) => void;
  setCompareOptions: (options: CompareOptions) => void;
  runComparison: () => Promise<void>;
  clearComparison: () => void;
  selectDiffPair: (pairKey: string | null) => void;
  setSelectedRecordId: (id: string | null) => void;
  deleteSession: (id: string) => Promise<void>;
  exportSession: (id: string) => Promise<void>;
  importSession: () => Promise<void>;
  mockSession: (id: string) => Promise<void>;
}

function getSessionsApi() {
  return window.mockforge.sessions;
}

function recordingErrorMessage(err: unknown): string {
  const t = useLocaleStore.getState().t;
  const code = err instanceof Error ? err.message : String(err);
  if (code === 'SERVER_NOT_RUNNING') return t.traffic.serverRequiredForRecording;
  if (code === 'NO_ENVIRONMENT') return t.traffic.noEnvironmentForRecording;
  return err instanceof Error ? err.message : t.traffic.startRecordingFailed;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSession: null,
  viewingSessionId: null,
  viewingSession: null,
  viewingRecords: [],
  selectedRecordId: null,
  historyMode: 'empty',
  comparisonResult: null,
  compareSelection: { sessionAId: null, sessionBId: null },
  selectedDiffPairKey: null,
  compareOptions: {
    smartOrdering: true,
    ignorePlatformNoise: true,
    ignoreTiming: false,
  },
  pendingNameSessionId: null,
  pendingNameDefault: '',

  sessionsLoading: false,
  recordsLoading: false,
  comparisonLoading: false,
  activeLoading: false,
  recordingBusy: false,

  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const sessions = await getSessionsApi().list();
      set({ sessions: sessions.filter((session) => session.status !== 'recording') });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
    } finally {
      set({ sessionsLoading: false });
    }
  },

  refreshActiveSession: async () => {
    set({ activeLoading: true });
    try {
      const active = await getSessionsApi().getActive();
      set({ activeSession: active });
    } catch {
      set({ activeSession: null });
    } finally {
      set({ activeLoading: false });
    }
  },

  startRecording: async () => {
    const t = useLocaleStore.getState().t;
    const env = await ensureCurrentEnvironment();
    if (!env) {
      showToast(t.traffic.noEnvironmentForRecording, 'error');
      return;
    }
    if (!useAppStore.getState().serverStatus.running) {
      showToast(t.traffic.serverRequiredForRecording, 'error');
      return;
    }

    set({ recordingBusy: true });
    try {
      const active = await getSessionsApi().startRecording();
      set({ activeSession: active });
      showToast(t.traffic.recordingActive, 'success');
    } catch (err) {
      showToast(recordingErrorMessage(err), 'error');
    } finally {
      set({ recordingBusy: false });
    }
  },

  stopRecording: async () => {
    const t = useLocaleStore.getState().t;
    set({ recordingBusy: true });
    try {
      const completed = await getSessionsApi().stopRecording();
      set({ activeSession: null });
      if (!completed) return;

      get().openNamingFlow(completed.id, completed.name);
      await get().loadSessions();
    } catch {
      showToast(t.traffic.stopRecordingFailed, 'error');
    } finally {
      set({ recordingBusy: false });
    }
  },

  openNamingFlow: (sessionId, defaultName) => {
    useAppStore.getState().setActiveTab('sessions');
    set({
      pendingNameSessionId: sessionId,
      pendingNameDefault: defaultName,
      historyMode: 'empty',
      viewingSessionId: null,
      viewingSession: null,
      viewingRecords: [],
      selectedRecordId: null,
    });
  },

  finishNamingSession: async (name) => {
    const t = useLocaleStore.getState().t;
    const { pendingNameSessionId, pendingNameDefault } = get();
    if (!pendingNameSessionId) return;

    const trimmed = name?.trim();
    if (trimmed && trimmed !== pendingNameDefault) {
      try {
        await getSessionsApi().rename(pendingNameSessionId, trimmed);
        showToast(t.sessions.renamed(trimmed), 'success');
      } catch {
        showToast(t.sessions.renameFailed, 'error');
      }
    }

    set({ pendingNameSessionId: null, pendingNameDefault: '' });
    await get().loadSessions();
    await get().openSession(pendingNameSessionId);
  },

  openSession: async (id) => {
    set({ recordsLoading: true, historyMode: 'session', viewingSessionId: id, pendingNameSessionId: null });
    try {
      const [session, records] = await Promise.all([
        getSessionsApi().get(id),
        getSessionsApi().getRecords(id),
      ]);
      if (!session) {
        showToast(useLocaleStore.getState().t.sessions.notFound, 'error');
        set({ historyMode: 'empty', viewingSessionId: null, viewingSession: null, viewingRecords: [] });
        return;
      }
      set({
        viewingSession: session,
        viewingRecords: records,
        selectedRecordId: records[0]?.id ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
      set({ historyMode: 'empty', viewingSessionId: null });
    } finally {
      set({ recordsLoading: false });
    }
  },

  closeSessionView: () => {
    set({
      historyMode: 'empty',
      viewingSessionId: null,
      viewingSession: null,
      viewingRecords: [],
      selectedRecordId: null,
    });
  },

  enterCompareMode: () => {
    set({
      historyMode: 'compare',
      viewingSessionId: null,
      viewingSession: null,
      viewingRecords: [],
      selectedRecordId: null,
      comparisonResult: null,
      selectedDiffPairKey: null,
      pendingNameSessionId: null,
    });
  },

  selectForCompare: (slot, sessionId) => {
    const { compareSelection } = get();
    set({
      compareSelection: slot === 'a'
        ? { ...compareSelection, sessionAId: sessionId }
        : { ...compareSelection, sessionBId: sessionId },
      comparisonResult: null,
      selectedDiffPairKey: null,
    });
  },

  setCompareOptions: (options) => {
    set({
      compareOptions: { ...get().compareOptions, ...options },
      comparisonResult: null,
      selectedDiffPairKey: null,
    });
  },

  runComparison: async () => {
    const { compareSelection, compareOptions } = get();
    const { sessionAId, sessionBId } = compareSelection;
    if (!sessionAId || !sessionBId) {
      showToast(useLocaleStore.getState().t.comparison.selectBoth, 'error');
      return;
    }
    if (sessionAId === sessionBId) {
      showToast(useLocaleStore.getState().t.comparison.sameSession, 'error');
      return;
    }

    set({ comparisonLoading: true, comparisonResult: null, selectedDiffPairKey: null });
    try {
      const result = await getSessionsApi().compare(sessionAId, sessionBId, compareOptions);
      const firstDiff = result.pairs.find((pair) => pair.status !== 'identical')?.key
        ?? result.pairs[0]?.key
        ?? null;
      set({ comparisonResult: result, selectedDiffPairKey: firstDiff });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
    } finally {
      set({ comparisonLoading: false });
    }
  },

  clearComparison: () => {
    set({
      comparisonResult: null,
      compareSelection: { sessionAId: null, sessionBId: null },
      selectedDiffPairKey: null,
      historyMode: 'empty',
    });
  },

  selectDiffPair: (pairKey) => set({ selectedDiffPairKey: pairKey }),

  setSelectedRecordId: (id) => set({ selectedRecordId: id }),

  deleteSession: async (id) => {
    const t = useLocaleStore.getState().t;
    const session = get().sessions.find((item) => item.id === id);
    if (!session) return;
    if (!confirm(t.sessions.deleteConfirm(session.name))) return;

    try {
      await getSessionsApi().delete(id);
      const { viewingSessionId } = get();
      if (viewingSessionId === id) {
        get().closeSessionView();
      }
      await get().loadSessions();
      showToast(t.sessions.deleted(session.name), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
    }
  },

  exportSession: async (id) => {
    const t = useLocaleStore.getState().t;
    try {
      const ok = await getSessionsApi().export(id);
      if (ok) showToast(t.sessions.exported, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
    }
  },

  importSession: async () => {
    const t = useLocaleStore.getState().t;
    try {
      const imported = await getSessionsApi().import();
      if (!imported) {
        showToast(t.sessions.importFailed, 'error');
        return;
      }
      await get().loadSessions();
      showToast(t.sessions.imported(imported.name), 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(message, 'error');
    }
  },

  mockSession: async (id) => {
    const t = useLocaleStore.getState().t;
    const env = await ensureCurrentEnvironment();
    if (!env) {
      showToast(t.traffic.noEnvironmentForRecording, 'error');
      return;
    }

    try {
      const records = await getSessionsApi().getRecords(id);
      if (records.length === 0) {
        showToast(t.sessions.mockRecordingEmpty, 'error');
        return;
      }
      await mockSessionRecording(records);
    } catch {
      showToast(t.sessions.mockRecordingFailed, 'error');
    }
  },
}));
