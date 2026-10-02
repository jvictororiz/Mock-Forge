import { EnvironmentPanel } from './EnvironmentPanel';
import { useI18n } from '../hooks/useI18n';

export function EnvironmentView() {
  const { t } = useI18n();

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        <div style={styles.content}>
          <h2 style={styles.pageTitle}>{t.app.environment}</h2>
          <p style={styles.pageSubtitle}>{t.environments.subtitle}</p>
          <EnvironmentPanel />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  content: {
    maxWidth: '720px',
    padding: '24px 32px 32px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: 600,
    marginBottom: '4px',
    letterSpacing: '-0.3px',
  },
  pageSubtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '20px',
  },
};
