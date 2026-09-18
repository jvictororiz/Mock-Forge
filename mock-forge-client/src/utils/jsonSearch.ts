export function findSearchMatches(text: string, query: string): number[] {
  const trimmed = query.trim();
  if (!trimmed || !text) return [];

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const matches: number[] = [];
  let start = 0;

  while (start < text.length) {
    const index = lowerText.indexOf(lowerQuery, start);
    if (index === -1) break;
    matches.push(index);
    start = index + lowerQuery.length;
  }

  return matches;
}
