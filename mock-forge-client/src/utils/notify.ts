import { useToastStore, type ToastType } from '../stores/toastStore';

const AUTO_DISMISS_MS = 5000;

export function showToast(message: string, type: ToastType = 'info'): void {
  const id = useToastStore.getState().addToast(message, type);
  window.setTimeout(() => {
    useToastStore.getState().removeToast(id);
  }, AUTO_DISMISS_MS);
}
