import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JsonEditor } from './JsonEditor';
import { JsonInlineFoldButton, JsonInlineLineNumber } from './JsonLineGutter';
import { JsonSearchBar } from './JsonSearchBar';
import { JsonSearchFloating } from './JsonSearchFloating';
import { useI18n } from '../hooks/useI18n';
import { useJsonSearch } from '../hooks/useJsonSearch';
import { useStructuralJsonFold } from '../hooks/useJsonFold';
import { buildStructuralFoldedView } from '../utils/jsonFold';
import { highlightJson } from '../utils/jsonHighlight';
import {
  buildJsonDisplayLines,
  formatBody,
  formatLeafValueForEdit,
  getCoveringAncestor,
  getValueAtPath,
  isAncestorPath,
  listRootMergeablePaths,
  parseJsonBody,
  parseLeafValueInput,
  setValueAtPath,
} from '../../shared/jsonMergeUtils';

function BlockJsonEditor({
  value,
  onChange,
  onCommit,
  invalidHint,
}: {
  value: string;
  onChange: (text: string) => void;
  onCommit: () => boolean;
  invalidHint: string;
}) {
  const invalid = value.trim() !== '' && parseJsonBody(value) === null;

  return (
    <div style={blockStyles.wrap}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => { onCommit(); }}
        rows={8}
        spellCheck={false}
        style={blockStyles.textarea}
      />
      {invalid ? (
        <span style={blockStyles.invalidHint}>{invalidHint}</span>
      ) : null}
    </div>
  );
}

const blockStyles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    margin: 0,
    padding: '10px 12px',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    lineHeight: 1.6,
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius)',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  invalidHint: {
    fontSize: '10px',
    color: 'var(--warning)',
  },
};

function HighlightedJson({
  text,
  style,
}: {
  text: string;
  style?: React.CSSProperties;
}) {
  const html = useMemo(() => highlightJson(text), [text]);

  return (
    <code
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function InlineValueEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      rows={1}
      spellCheck={false}
      style={styles.valueInput}
    />
  );
}

export function MergeJsonEditor({
  value,
  mergeFields,
  onChange,
  onMergeFieldsChange,
  hintText,
}: {
  value: string;
  mergeFields: string[];
  onChange: (value: string) => void;
  onMergeFieldsChange: (fields: string[]) => void;
  hintText?: string;
}) {
  const { t } = useI18n();
  const resolvedHintText = hintText ?? t.mergeJson.defaultBodyHint;
  const [editingBlockPath, setEditingBlockPath] = useState<string | null>(null);
  const [blockDraft, setBlockDraft] = useState<string>('');
  const parsed = useMemo(() => parseJsonBody(value), [value]);
  const lines = useMemo(() => buildJsonDisplayLines(value), [value]);
  const fold = useStructuralJsonFold(lines);
  const visibleLines = useMemo(
    () => buildStructuralFoldedView(lines, fold.collapsed),
    [lines, fold.collapsed],
  );
  const search = useJsonSearch(value);
  const queryLower = search.query.trim().toLowerCase();
  const activeLineIndex = useMemo(() => {
    if (search.matchCount === 0) return -1;
    const offset = search.matches[search.activeIndex];
    if (offset === undefined) return -1;
    return value.slice(0, offset).split('\n').length - 1;
  }, [search.matchCount, search.matches, search.activeIndex, value]);
  const rootPaths = useMemo(
    () => (parsed === null ? [] : listRootMergeablePaths(parsed)),
    [parsed],
  );
  const selectedSet = useMemo(() => new Set(mergeFields), [mergeFields]);
  const invalidJson = parsed === null && !!value.trim();

  const togglePath = (path: string) => {
    if (getCoveringAncestor(path, mergeFields)) return;

    if (selectedSet.has(path)) {
      onMergeFieldsChange(mergeFields.filter((item) => item !== path));
      if (editingBlockPath === path) {
        setEditingBlockPath(null);
        setBlockDraft('');
      }
      return;
    }

    const withoutDescendants = mergeFields.filter((item) => !isAncestorPath(path, item));
    onMergeFieldsChange([...withoutDescendants, path]);
  };

  const updateLeafValue = (path: string, rawValue: string) => {
    if (parsed === null) return;
    const nextValue = parseLeafValueInput(rawValue);
    const updated = setValueAtPath(parsed, path, nextValue);
    onChange(formatBody(updated));
  };

  const commitBlockValue = (path: string, jsonText: string): boolean => {
    if (parsed === null) return false;
    const nextValue = parseJsonBody(jsonText);
    if (nextValue === null) return false;
    const updated = setValueAtPath(parsed, path, nextValue);
    onChange(formatBody(updated));
    return true;
  };

  const openBlockEditor = (path: string) => {
    if (parsed === null) return;
    const blockValue = getValueAtPath(parsed, path);
    setBlockDraft(formatBody(blockValue));
    setEditingBlockPath(path);
  };

  const closeBlockEditor = (path: string) => {
    if (blockDraft.trim() && !commitBlockValue(path, blockDraft)) {
      return;
    }
    setEditingBlockPath(null);
    setBlockDraft('');
  };

  const toggleBlockEditor = (path: string) => {
    if (editingBlockPath === path) {
      closeBlockEditor(path);
      return;
    }
    if (editingBlockPath) {
      closeBlockEditor(editingBlockPath);
    }
    openBlockEditor(path);
  };

  if (invalidJson) {
    return (
      <JsonEditor
        value={value}
        onChange={onChange}
        minRows={8}
      />
    );
  }

  return (
    <div
      ref={search.containerRef}
      tabIndex={-1}
      data-json-search-root=""
      style={styles.shell}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (['TEXTAREA', 'INPUT', 'BUTTON'].includes(target.tagName)) return;
        search.focusContainer();
      }}
    >
      <JsonSearchFloating containerRef={search.containerRef} open={search.open} inputRef={search.inputRef}>
        <JsonSearchBar
          inputRef={search.inputRef}
          query={search.query}
          onQueryChange={search.setQuery}
          matchCount={search.matchCount}
          activeIndex={search.activeIndex}
          onPrev={search.goPrev}
          onNext={search.goNext}
          onClose={search.close}
        />
      </JsonSearchFloating>
      <div style={styles.container}>
        <div style={styles.toolbar}>
          <span style={styles.toolbarHint}>{resolvedHintText}</span>
          <div style={styles.toolbarActions}>
            <button type="button" style={styles.toolBtn} onClick={() => onMergeFieldsChange(rootPaths)}>
              {t.common.selectAll}
            </button>
            <button type="button" style={styles.toolBtn} onClick={() => {
              onMergeFieldsChange([]);
              setEditingBlockPath(null);
            }}
            >
              {t.common.clearAll}
            </button>
          </div>
        </div>

        <div style={styles.editor}>
          {visibleLines.map((line) => {
            const index = line.sourceLine;
            const lineNumber = index + 1;
            const path = line.path;
            const isSelectable = !!path;
            const nodeKind = line.nodeKind ?? 'leaf';
            const isContainer = nodeKind === 'object' || nodeKind === 'array';
            const coveringAncestor = path ? getCoveringAncestor(path, mergeFields) : null;
            const isIncluded = !!coveringAncestor;
            const isSelected = path ? selectedSet.has(path) : false;
            const isActive = isSelected || isIncluded;
            const hasComma = line.trailingComma === true;
            const editValue = formatLeafValueForEdit(line.value);
            const displayValue = `${JSON.stringify(line.value)}${hasComma ? ',' : ''}`;
            const leadingIndent = line.text.match(/^\s*/)?.[0] ?? '';
            const lineHaystack = `${line.text}${line.key ?? ''}${displayValue}`.toLowerCase();
            const lineMatchesSearch = !!queryLower && lineHaystack.includes(queryLower);
            const isActiveSearchLine = index === activeLineIndex;

            if (!isSelectable) {
              return (
                <div
                  key={`${index}-${line.text}`}
                  style={{
                    ...styles.line,
                    ...(line.isCollapsed ? styles.lineCollapsed : {}),
                    ...(isActiveSearchLine ? styles.lineSearchActive : lineMatchesSearch ? styles.lineSearchMatch : {}),
                  }}
                  data-line-index={index}
                  data-search-active={isActiveSearchLine ? 'true' : undefined}
                  onClick={line.isCollapsed ? () => fold.toggle(index) : undefined}
                  role={line.isCollapsed ? 'button' : undefined}
                  aria-label={line.isCollapsed ? t.mergeJson.expandBlock : undefined}
                >
                  <JsonInlineFoldButton
                    isFoldStart={line.isFoldStart}
                    isCollapsed={line.isCollapsed}
                    onToggle={() => fold.toggle(index)}
                  />
                  <JsonInlineLineNumber line={lineNumber} />
                  <span style={styles.checkboxSpacer} />
                  <HighlightedJson text={line.text} style={styles.lineText} />
                </div>
              );
            }

            const keyPrefix = line.key
              ? `${leadingIndent}"${line.key}": `
              : leadingIndent;
            const containerSuffix = isContainer
              ? (nodeKind === 'array' ? '[' : '{')
              : '';
            const checkboxDisabled = isIncluded && !isSelected;

            return (
              <React.Fragment key={`${path}-${index}`}>
                <div
                  style={{
                    ...styles.line,
                    ...(isActive ? styles.lineSelected : styles.lineMuted),
                    ...(isIncluded && !isSelected ? styles.lineIncluded : {}),
                    ...(isActiveSearchLine ? styles.lineSearchActive : lineMatchesSearch ? styles.lineSearchMatch : {}),
                  }}
                  data-line-index={index}
                  data-search-active={isActiveSearchLine ? 'true' : undefined}
                >
                  <JsonInlineFoldButton
                    isFoldStart={line.isFoldStart}
                    isCollapsed={line.isCollapsed}
                    onToggle={() => fold.toggle(index)}
                  />
                  <JsonInlineLineNumber line={lineNumber} />
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={checkboxDisabled}
                    onChange={() => togglePath(path!)}
                    style={styles.checkbox}
                    aria-label={t.mergeJson.overrideAria(path!)}
                  />
                  <div style={styles.lineRow}>
                    <HighlightedJson
                      text={isContainer ? `${keyPrefix}${containerSuffix}` : keyPrefix}
                      style={styles.keyPrefix}
                    />
                    {isContainer ? (
                      <div style={styles.containerActions}>
                        {isIncluded && !isSelected ? (
                          <span style={styles.includedBadge}>{t.mergeJson.includedInBlock}</span>
                        ) : null}
                        {isSelected ? (
                          <button
                            type="button"
                            style={styles.blockBtn}
                            onClick={() => toggleBlockEditor(path!)}
                          >
                            {editingBlockPath === path ? t.mergeJson.closeBlock : t.mergeJson.editBlock}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        {isIncluded ? (
                          <>
                            <HighlightedJson text={displayValue} style={styles.dimValue} />
                            <span style={styles.includedBadge}>{t.mergeJson.included}</span>
                          </>
                        ) : isSelected ? (
                          <div style={styles.valueWithComma}>
                            <InlineValueEditor
                              value={editValue}
                              onChange={(next) => updateLeafValue(path!, next)}
                            />
                            {hasComma ? <span style={styles.trailingComma}>,</span> : null}
                          </div>
                        ) : (
                          <HighlightedJson text={displayValue} style={styles.dimValue} />
                        )}
                      </>
                    )}
                  </div>
                </div>
                {isContainer && isSelected && editingBlockPath === path ? (
                  <div style={styles.blockEditor}>
                    <BlockJsonEditor
                      value={blockDraft}
                      onChange={setBlockDraft}
                      onCommit={() => commitBlockValue(path!, blockDraft)}
                      invalidHint={t.mergeJson.invalidJsonHint}
                    />
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    position: 'relative',
    outline: 'none',
  },
  container: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-primary)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  toolbarHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  toolbarActions: {
    display: 'flex',
    gap: '6px',
    flexShrink: 0,
  },
  toolBtn: {
    padding: '4px 8px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-tertiary)',
  },
  editor: {
    padding: '10px 4px 10px 0',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    lineHeight: 1.6,
  },
  line: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '4px',
    padding: '1px 4px',
    borderRadius: '4px',
  },
  lineSelected: {
    background: 'rgba(73, 204, 144, 0.12)',
    boxShadow: 'inset 2px 0 0 var(--accent)',
  },
  lineIncluded: {
    opacity: 0.55,
  },
  lineMuted: {
    opacity: 0.62,
  },
  lineCollapsed: {
    cursor: 'pointer',
  },
  lineSearchMatch: {
    background: 'rgba(255, 213, 0, 0.12)',
  },
  lineSearchActive: {
    background: 'rgba(255, 153, 0, 0.22)',
    boxShadow: 'inset 2px 0 0 var(--warning)',
  },
  checkboxSpacer: {
    width: '14px',
    flexShrink: 0,
  },
  checkbox: {
    marginTop: '3px',
    flexShrink: 0,
  },
  lineRow: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: '6px',
    flexWrap: 'wrap',
  },
  keyPrefix: {
    flexShrink: 0,
    whiteSpace: 'pre',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
  lineText: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
  containerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  blockBtn: {
    padding: '2px 8px',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--accent)',
    border: '1px solid rgba(73, 204, 144, 0.45)',
    borderRadius: '3px',
    background: 'rgba(73, 204, 144, 0.08)',
  },
  includedBadge: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    padding: '1px 4px',
    borderRadius: '3px',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    flexShrink: 0,
  },
  blockEditor: {
    margin: '4px 0 8px 52px',
    paddingRight: '8px',
  },
  valueInput: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    minHeight: '1.6em',
    margin: 0,
    padding: '1px 4px',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    lineHeight: 1.6,
    color: 'var(--text-primary)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--accent)',
    borderRadius: '3px',
    resize: 'none',
    overflow: 'hidden',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    boxSizing: 'border-box',
  },
  dimValue: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
  valueWithComma: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  trailingComma: {
    flexShrink: 0,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    color: 'var(--text-primary)',
    paddingTop: '1px',
  },
};
