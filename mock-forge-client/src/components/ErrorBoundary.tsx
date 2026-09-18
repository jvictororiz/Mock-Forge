import React from 'react';
import { useLocaleStore } from '../stores/localeStore';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('UI render error', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const t = useLocaleStore.getState().t;
    const title = this.props.fallbackTitle ?? t.common.unexpectedError;

    return (
      <div style={styles.wrap}>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.message}>{this.state.error.message || t.common.unexpectedErrorHint}</p>
        <button type="button" style={styles.button} onClick={this.handleRetry}>
          {t.common.tryAgain}
        </button>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '32px',
    background: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  message: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
    maxWidth: '420px',
    wordBreak: 'break-word',
  },
  button: {
    marginTop: '4px',
    padding: '8px 16px',
    borderRadius: 'var(--radius)',
    background: 'var(--accent)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
  },
};
