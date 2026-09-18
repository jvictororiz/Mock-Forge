function MirrorCameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="13"
        r="3.25"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function MirrorRecordIcon({ stopping }: { stopping: boolean }) {
  if (stopping) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="7" fill="currentColor" />
    </svg>
  );
}

export { MirrorCameraIcon, MirrorRecordIcon };
