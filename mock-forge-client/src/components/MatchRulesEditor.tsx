import React from 'react';
import type { MatchRule } from '../types';

interface MatchRulesEditorProps {
  rules: MatchRule[];
  onChange: (rules: MatchRule[]) => void;
  embedded?: boolean;
}

export function MatchRulesEditor({ rules, onChange, embedded = false }: MatchRulesEditorProps) {
  const addRule = () => {
    onChange([...rules, { type: 'header_equals', key: '', value: '' }]);
  };

  const updateRule = (index: number, partial: Partial<MatchRule>) => {
    const next = [...rules];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, i) => i !== index));
  };

  return (
    <div style={embedded ? styles.sectionEmbedded : styles.section}>
      {!embedded && (
        <>
          <div style={styles.sectionHeader}>
            <label style={styles.label}>Match Rules</label>
            <button type="button" onClick={addRule} style={styles.smallBtn}>+ Add rule</button>
          </div>
          <p style={styles.helpText}>
            Extra conditions beyond method and path for this variant.
          </p>
        </>
      )}
      {embedded && (
        <div style={styles.embeddedToolbar}>
          <button type="button" onClick={addRule} style={styles.smallBtn}>+ Add rule</button>
        </div>
      )}
      {rules.map((rule, i) => (
        <div key={i} style={styles.ruleRow}>
          <select
            value={rule.type}
            onChange={(e) => updateRule(i, { type: e.target.value as MatchRule['type'] })}
            style={styles.input}
          >
            <option value="header_equals">Header equals</option>
            <option value="body_field_equals">Body field equals</option>
            <option value="query_param_equals">Query param equals</option>
          </select>
          <input
            placeholder="Key"
            value={rule.key}
            onChange={(e) => updateRule(i, { key: e.target.value })}
            style={styles.input}
          />
          <input
            placeholder="Value"
            value={rule.value}
            onChange={(e) => updateRule(i, { value: e.target.value })}
            style={styles.input}
          />
          <button type="button" onClick={() => removeRule(i)} style={styles.removeBtn}>×</button>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: '16px',
  },
  sectionEmbedded: {
    marginBottom: 0,
  },
  embeddedToolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '8px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  helpText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
  },
  ruleRow: {
    display: 'flex',
    gap: '6px',
    marginBottom: '6px',
    alignItems: 'center',
  },
  smallBtn: {
    fontSize: '11px',
    color: 'var(--accent)',
    padding: '2px 6px',
  },
  removeBtn: {
    fontSize: '16px',
    color: 'var(--text-muted)',
    padding: '4px',
  },
};
