import { LOCALES } from '../i18n';
import { useI18n } from '../hooks/useI18n';
import { showToast } from '../utils/notify';

export function LanguagePanel() {
  const { t, locale, setLocale } = useI18n();

  const handleSelect = (next: typeof locale) => {
    if (next === locale) return;
    void setLocale(next)
      .then(() => {
        showToast(t.language.changed, 'success');
      })
      .catch((err) => {
        console.error('Failed to change language', err);
        showToast((err as Error).message, 'error');
      });
  };

  return (
    <div style={styles.wrap}>
      <p style={styles.subtitle}>{t.language.subtitle}</p>

      <div style={styles.list}>
        {LOCALES.map((option) => {
          const active = locale === option.id;
          return (
            <button
              key={option.id}
              type="button"
              style={{
                ...styles.card,
                ...(active ? styles.cardActive : {}),
              }}
              onClick={() => handleSelect(option.id)}
            >
              <div style={styles.cardMain}>
                <span style={styles.label}>{t.language[option.labelKey]}</span>
                <span style={styles.code}>{option.id.toUpperCase()}</span>
              </div>
              {active && <span style={styles.badge}>{t.language.active}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    margin: 0,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxWidth: '420px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '14px 16px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    textAlign: 'left',
    width: '100%',
  },
  cardActive: {
    borderColor: 'var(--accent)',
    background: 'rgba(73, 204, 144, 0.06)',
  },
  cardMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  code: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
  badge: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--accent)',
    padding: '2px 8px',
    borderRadius: '3px',
    background: 'rgba(73, 204, 144, 0.12)',
    border: '1px solid rgba(73, 204, 144, 0.35)',
    flexShrink: 0,
  },
};
