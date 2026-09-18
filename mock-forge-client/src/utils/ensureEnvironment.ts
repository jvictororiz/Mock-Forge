import type { Environment } from '../types';
import { useAppStore } from '../stores/appStore';

let loadPromise: Promise<Environment | null> | null = null;

export async function ensureCurrentEnvironment(): Promise<Environment | null> {
  const existing = useAppStore.getState().currentEnvironment;
  if (existing) return existing;

  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [current, envs] = await Promise.all([
          window.mockforge.environment.current(),
          window.mockforge.environment.list(),
        ]);
        useAppStore.getState().setEnvironments(envs);
        if (current) {
          useAppStore.getState().setCurrentEnvironment(current);
          return current;
        }
        return useAppStore.getState().currentEnvironment;
      } catch (err) {
        console.error('Failed to load environment', err);
        return null;
      } finally {
        loadPromise = null;
      }
    })();
  }

  return loadPromise;
}
