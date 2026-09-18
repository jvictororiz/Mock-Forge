import { create } from 'zustand';
import type { AppUpdateCheckResult } from '../../shared/appUpdate';

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
  check: () => Promise<AppUpdateCheckResult | null>;
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

  check: async () => {
    if (get().checking) return get().result;
    bindProgress();
    set({ checking: true });
    try {
      const result = await window.mockforge.updates.check();
      set({ result, checking: false });
      return result;
    } catch (error) {
      const failed: AppUpdateCheckResult = {
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
      };
      set({ result: failed, checking: false });
      return failed;
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
