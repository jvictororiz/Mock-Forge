import { describe, expect, it } from 'vitest';
import { diffJsonContent, diffTextLines, renderDiffLineHtml } from '../src/utils/jsonLineDiff';
import { diffJsonStructures } from '../src/utils/jsonStructuralDiff';

describe('jsonLineDiff', () => {
  it('aligns equal lines and marks changes', () => {
    const rows = diffTextLines('{\n  "a": 1\n}', '{\n  "a": 2\n}');
    const changed = rows.find((row) => row.type === 'both');
    expect(changed).toBeDefined();
    expect(changed?.leftLine).toContain('"a": 1');
    expect(changed?.rightLine).toContain('"a": 2');
  });

  it('highlights removed and inserted lines', () => {
    const rows = diffTextLines('line-a', 'line-b');
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('both');

    const leftHtml = renderDiffLineHtml(rows[0].leftLine, rows[0].rightLine, rows[0].type, 'left');
    const rightHtml = renderDiffLineHtml(rows[0].rightLine, rows[0].leftLine, rows[0].type, 'right');

    expect(leftHtml).toContain('json-diff-char-delete');
    expect(rightHtml).toContain('json-diff-char-insert');
  });

  it('collects diff locations across sections', () => {
    const rows = diffJsonContent('{\n  "a": 1\n}', '{\n  "a": 2\n}', true);
    const changed = rows.filter((row) => row.type !== 'equal');
    expect(changed.length).toBeGreaterThan(0);
  });
});

describe('jsonStructuralDiff', () => {
  it('aligns object keys even when earlier arrays differ in length', () => {
    const left = {
      analytics: {
        available_payment_methods: ['WALLET', 'CREDIT_CARD', 'BNPL', 'DIGITAL_WALLET'],
      },
      correlation_id: null,
      deduplication_hash: 'hash-a',
      installment_step_data: null,
    };
    const right = {
      analytics: {
        available_payment_methods: ['WALLET', 'CREDIT_CARD', 'BNPL', 'WAGE_ADVANCE', 'PIGGY', 'DIGITAL_WALLET'],
      },
      correlation_id: null,
      deduplication_hash: 'hash-b',
      installment_step_data: { available: true, descending: true },
    };

    const rows = diffJsonStructures(JSON.stringify(left), JSON.stringify(right));
    expect(rows).not.toBeNull();

    const dedupRow = rows?.find(
      (row) => row.leftLine?.includes('deduplication_hash') && row.rightLine?.includes('deduplication_hash'),
    );
    expect(dedupRow).toBeDefined();
    expect(dedupRow?.type).toBe('both');

    const correlationRow = rows?.find(
      (row) => row.leftLine?.includes('correlation_id') && row.rightLine?.includes('correlation_id'),
    );
    expect(correlationRow?.type).toBe('equal');
  });

  it('ignores key order differences', () => {
    const left = {
      account_number: '50590324',
      account_type: 'PAYMENT_ACCOUNT',
      branch_number: '1',
    };
    const right = {
      branch_number: '1',
      account_type: 'PAYMENT_ACCOUNT',
      account_number: '50590324',
    };

    const rows = diffJsonStructures(JSON.stringify(left), JSON.stringify(right));
    expect(rows?.every((row) => row.type === 'equal')).toBe(true);
  });

  it('marks extra array items without desyncing later keys', () => {
    const left = { items: ['A', 'B'], status: 'ok' };
    const right = { items: ['A', 'B', 'C'], status: 'ok' };

    const rows = diffJsonStructures(JSON.stringify(left), JSON.stringify(right));
    const statusRow = rows?.find(
      (row) => row.leftLine?.includes('"status"') && row.rightLine?.includes('"status"'),
    );
    expect(statusRow?.type).toBe('equal');
  });

  it('aligns equal primitive array values even when extra items are inserted before them', () => {
    const left = {
      available_payment_methods: ['WALLET', 'CREDIT_CARD', 'BNPL', 'DIGITAL_WALLET'],
    };
    const right = {
      available_payment_methods: ['WALLET', 'CREDIT_CARD', 'BNPL', 'PIGGY', 'DIGITAL_WALLET'],
    };

    const rows = diffJsonStructures(JSON.stringify(left), JSON.stringify(right));
    const digitalRow = rows?.find(
      (row) => row.leftLine?.includes('DIGITAL_WALLET') && row.rightLine?.includes('DIGITAL_WALLET'),
    );
    expect(digitalRow?.type).toBe('equal');

    const piggyRow = rows?.find((row) => row.rightLine?.includes('PIGGY'));
    expect(piggyRow?.type).toBe('right');
  });

  it('treats reordered primitive arrays with the same items as equal', () => {
    const left = { screen_status: ['WALL', 'SHARED_WALLET', 'CREDIT_CARD_1'] };
    const right = { screen_status: ['CREDIT_CARD_1', 'WALL', 'SHARED_WALLET'] };

    const rows = diffJsonStructures(JSON.stringify(left), JSON.stringify(right));
    expect(rows?.every((row) => row.type === 'equal')).toBe(true);
  });
});
