import { create } from 'zustand';
import { mergeBackgroundUpdateCheck, type AppUpdateCheckResult } from '../../shared/appUpdate';

type ApplyResult = {
  success: boolean;
  error?: string;
  openedReleasePage?: boolean;
};

type UpdateState = {
  checking: boolean;
  applying: boolean;
  progress: number | null;
  result: AppUpdateCheckResult | null;
  check: (options?: { background?: boolean }) => Promise<AppUpdateCheckResult | null>;
  apply: () => Promise<ApplyResult>;
};

let progressBound = false;

function bindProgress(): void {
  if (progressBound || typeof window === 'undefined' || !window.mockforge?.updates) return;
  progressBound = true;
  window.mockforge.updates.onProgress((percent) => {
    useUpdateStore.setState({ progress: percent });
  });
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  checking: false,
  applying: false,
  progress: null,
  result: null,

  check: async (options) => {
    if (get().checking) return get().result;
    if (options?.background && get().applying) return get().result;
    bindProgress();
    set({ checking: true });
    const publish = (result: AppUpdateCheckResult) => {
      const next = options?.background
        ? mergeBackgroundUpdateCheck(get().result, result)
        : result;
      set({ result: next, checking: false });
      return next;
    };
    try {
      return publish(await window.mockforge.updates.check());
    } catch (error) {
      return publish({
        currentVersion: get().result?.currentVersion || '',
        latestVersion: null,
        available: false,
        method: null,
        releaseUrl: null,
        notes: '',
        assetName: null,
        downloadUrl: null,
        caskUrl: null,
        brewInstallCommand: get().result?.brewInstallCommand || '',
        packaged: get().result?.packaged ?? false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  apply: async () => {
    if (get().applying) {
      return { success: false, error: 'Update already in progress' };
    }
    bindProgress();
    set({ applying: true, progress: null });
    try {
      const result = await window.mockforge.updates.apply();
      set({ applying: false });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ applying: false });
      return { success: false, error: message };
    }
  },
}));
