import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { bootstrapLocaleStore } from '../stores/localeStore';
import type { FeedbackErrorCode, GitHubFeedbackStatus } from '../../shared/githubFeedback';
import type { Translation } from '../i18n/types';

type PublishedIssue = {
  number: number;
  url: string;
};

export function FeedbackView() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<GitHubFeedbackStatus | null>(null);
  const [error, setError] = useState<FeedbackErrorCode | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState<PublishedIssue | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [star, setStar] = useState<{ starred: boolean; count?: number } | null>(null);
  const [starError, setStarError] = useState<string | null>(null);
  const [starring, setStarring] = useState(false);
  const signInRequest = useRef(0);

  useEffect(() => {
    if (t.common && t.feedback?.star) return;
    void bootstrapLocaleStore();
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    void window.mockforge.feedback?.status().then((next) => {
      if (!cancelled) setStatus(next);
    });
    const unsubscribeSignedIn = window.mockforge.feedback.onSignedIn((next) => {
      setStatus(next);
      setAvatarFailed(false);
      setError(null);
      setErrorDetail(undefined);
      setStarting(false);
    });
    const unsubscribeFailed = window.mockforge.feedback.onSignInFailed((failure) => {
      setError(failure.error);
      setErrorDetail(failure.detail);
      setStarting(false);
      void window.mockforge.feedback.status().then(setStatus);
    });
    return () => {
      cancelled = true;
      unsubscribeSignedIn();
      unsubscribeFailed();
    };
  }, []);

  useEffect(() => {
    if (!status?.authenticated) {
      setStar(null);
      setStarError(null);
      return;
    }
    let cancelled = false;
    void window.mockforge.feedback?.starState?.().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setStar(null);
        setStarError(result.error === 'forbidden' ? t.feedback?.starSignInAgain ?? null : null);
        return;
      }
      setStarError(null);
      setStar({ starred: result.starred, count: result.count });
    });
    return () => {
      cancelled = true;
    };
  }, [status?.authenticated, status?.login, t]);

  const showError = (code: FeedbackErrorCode, detail?: string) => {
    setError(code);
    setErrorDetail(detail);
  };

  const signIn = async () => {
    const request = ++signInRequest.current;
    setStarting(true);
    setError(null);
    setErrorDetail(undefined);
    const result = await window.mockforge.feedback.signIn();
    if (request !== signInRequest.current) return;
    setStarting(false);
    if (!result.ok) {
      showError(result.error, result.detail);
      return;
    }
    const next = await window.mockforge.feedback.status();
    if (request !== signInRequest.current) return;
    setStatus(next);
  };

  const cancelSignIn = async () => {
    signInRequest.current += 1;
    setStarting(false);
    setError(null);
    setStatus(await window.mockforge.feedback.cancelSignIn());
  };

  const signOut = async () => {
    setTitle('');
    setDescription('');
    setPublished(null);
    setError(null);
    setStar(null);
    setStarError(null);
    setAvatarFailed(false);
    setStatus(await window.mockforge.feedback.signOut());
  };

  const toggleStar = async () => {
    if (!star || starring) return;
    setStarring(true);
    setStarError(null);
    try {
      const result = await window.mockforge.feedback.setStarred(!star.starred);
      if (!result.ok) {
        if (result.error === 'forbidden') setStarError(t.feedback.starSignInAgain);
        if (result.error === 'unauthenticated') setStatus(await window.mockforge.feedback.status());
        return;
      }
      setStar({ starred: result.starred, count: result.count });
    } finally {
      setStarring(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setErrorDetail(undefined);
    try {
      const result = await window.mockforge.feedback.submit({ title, description, locale });
      if (!result.ok) {
        showError(result.error, result.detail);
        if (result.error === 'unauthenticated') {
          setStatus(await window.mockforge.feedback.status());
        }
        return;
      }
      setPublished({ number: result.number, url: result.url });
      setTitle('');
      setDescription('');
    } finally {
      setSubmitting(false);
    }
  };

  if (!t.common || !t.feedback || !status) {
    return <div style={styles.empty}>{t.common?.loading ?? 'Carregando…'}</div>;
  }

  if (!status.authenticated) {
    return (
      <div style={styles.gate}>
        {status.pending ? (
          <>
            <p style={styles.waiting}>{t.feedback.signInWaiting}</p>
            <p style={styles.code}>{status.pending.userCode}</p>
            <p style={styles.hint}>{t.feedback.userCodeHint}</p>
            <button type="button" style={styles.secondaryBtn} onClick={() => void window.mockforge.feedback.open(status.pending!.verificationUri)}>
              {t.feedback.openGitHub}
            </button>
            <button type="button" style={styles.textBtn} onClick={() => void cancelSignIn()}>
              {t.common.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            style={{
              ...styles.githubBtn,
              opacity: starting ? 0.7 : 1,
            }}
            onClick={() => void signIn()}
            disabled={starting}
          >
            <GitHubMark />
            {t.feedback.signIn}
          </button>
        )}
        {error && <p style={styles.error}>{feedbackErrorMessage(t, error, errorDetail)}</p>}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        <div style={styles.content}>
          <div style={styles.account}>
            {status.avatarUrl && !avatarFailed ? (
              <img
                src={status.avatarUrl}
                alt=""
                width={28}
                height={28}
                style={styles.avatar}
                onError={() => setAvatarFailed(true)}
              />
            ) : null}
            <span style={styles.accountName}>{t.feedback.signedInAs(status.login ?? '')}</span>
            <button type="button" style={styles.textBtn} onClick={() => void signOut()}>
              {t.feedback.signOut}
            </button>
            {star ? (
              <button
                type="button"
                style={{
                  ...styles.starBtn,
                  ...(star.starred ? styles.starBtnOn : {}),
                  opacity: starring ? 0.7 : 1,
                }}
                aria-pressed={star.starred}
                disabled={starring}
                onClick={() => void toggleStar()}
              >
                <span aria-hidden="true">{star.starred ? '★' : '☆'}</span>
                {star.starred ? t.feedback.starred : t.feedback.star}
                {star.count != null ? <span style={styles.starCount}>{star.count}</span> : null}
              </button>
            ) : null}
          </div>
          {starError ? <p style={styles.starError}>{starError}</p> : null}

          <h2 style={styles.pageTitle}>{t.feedback.pageTitle}</h2>
          <p style={styles.pageSubtitle}>{t.feedback.pageSubtitle}</p>

          {published ? (
            <div style={styles.success}>
              <p>{t.feedback.submitted(published.number)}</p>
              <div style={styles.successActions}>
                <button type="button" style={styles.primaryBtn} onClick={() => void window.mockforge.feedback.open(published.url)}>
                  {t.feedback.openIssue}
                </button>
                <button type="button" style={styles.secondaryBtn} onClick={() => setPublished(null)}>
                  {t.feedback.sendAnother}
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <label style={styles.field}>
                <span style={styles.label}>{t.feedback.fieldTitle}</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={256}
                  required
                  style={styles.input}
                />
              </label>
              <label style={styles.field}>
                <span style={styles.label}>{t.feedback.fieldDescription}</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                  rows={8}
                  style={styles.textarea}
                />
              </label>
              {error && <p style={styles.formError}>{feedbackErrorMessage(t, error, errorDetail)}</p>}
              <button type="submit" style={styles.primaryBtn} disabled={submitting}>
                {submitting ? t.feedback.submitting : t.feedback.submit}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function feedbackErrorMessage(t: Translation, error: FeedbackErrorCode, detail?: string): string {
  const message = t.feedback.errors[error];
  if ((error === 'unknown' || error === 'forbidden' || error === 'validation') && detail) {
    return `${message} (${detail})`;
  }
  return message;
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
  },
  gate: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    minWidth: 0,
    padding: '24px',
  },
  githubBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minHeight: '40px',
    padding: '8px 16px',
    background: '#ffffff',
    color: '#24292f',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1,
  },
  waiting: {
    fontSize: '14px',
    fontWeight: 600,
  },
  code: {
    fontFamily: 'var(--font-mono)',
    fontSize: '28px',
    fontWeight: 600,
    letterSpacing: '2px',
  },
  hint: {
    display: 'block',
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    maxWidth: '360px',
    textAlign: 'center',
  },
  error: {
    marginTop: '8px',
    fontSize: '12px',
    color: 'var(--danger)',
    maxWidth: '420px',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  formError: {
    margin: '0 0 12px',
    fontSize: '12px',
    color: 'var(--danger)',
    lineHeight: 1.5,
  },
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflow: 'auto',
  },
  content: {
    width: '100%',
    maxWidth: '560px',
    marginTop: 'auto',
    marginBottom: 'auto',
    padding: '32px 24px',
  },
  account: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '20px',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
    flexShrink: 0,
  },
  accountName: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  textBtn: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    textDecoration: 'underline',
    padding: '4px 0',
  },
  starBtn: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontWeight: 600,
  },
  starBtnOn: {
    color: 'var(--warning)',
    borderColor: 'var(--warning)',
  },
  starCount: {
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  starError: {
    margin: '-12px 0 16px',
    fontSize: '12px',
    color: 'var(--warning)',
    lineHeight: 1.5,
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
  field: {
    display: 'block',
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    fontSize: '13px',
    resize: 'vertical',
    minHeight: '140px',
  },
  primaryBtn: {
    padding: '10px 18px',
    background: 'var(--accent)',
    color: '#fff',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    fontWeight: 600,
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    fontWeight: 600,
  },
  success: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '12px',
    fontSize: '14px',
  },
  successActions: {
    display: 'flex',
    gap: '8px',
  },
};
