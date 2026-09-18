import { describe, it, expect } from 'vitest';
import { findSearchMatches } from '../src/utils/jsonSearch';
import { highlightJsonWithSearch } from '../src/utils/jsonSearchHighlight';

describe('findSearchMatches', () => {
  it('returns empty array for empty query', () => {
    expect(findSearchMatches('{"a":1}', '')).toEqual([]);
    expect(findSearchMatches('{"a":1}', '   ')).toEqual([]);
  });

  it('finds case-insensitive matches', () => {
    expect(findSearchMatches('{"Amount": 10, "amount": 2}', 'amount')).toEqual([2, 16]);
  });
});

describe('highlightJsonWithSearch', () => {
  it('wraps matches with search mark classes', () => {
    const html = highlightJsonWithSearch('{"name":"John"}', 'John', 0);
    expect(html).toContain('json-search-active');
    expect(html).toContain('John');
  });

  it('falls back to syntax highlight when query is empty', () => {
    const html = highlightJsonWithSearch('{"ok":true}', '', 0);
    expect(html).toContain('json-boolean');
    expect(html).not.toContain('json-search-match');
  });

  it('preserves line breaks for multiline JSON', () => {
    const json = '{\n  "ok": true\n}';
    const html = highlightJsonWithSearch(json, '', 0);
    expect(html).toContain('<br />');
  });

  it('keeps syntax highlighting on lines after a match', () => {
    const json = '{\n  "name": "John",\n  "age": 30\n}';
    const html = highlightJsonWithSearch(json, 'name', 0);

    const matchIndex = html.indexOf('json-search-active');
    const numberIndex = html.indexOf('json-number');
    expect(matchIndex).toBeGreaterThan(-1);
    expect(numberIndex).toBeGreaterThan(matchIndex);
  });
});
