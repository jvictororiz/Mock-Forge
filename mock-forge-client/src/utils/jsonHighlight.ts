export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function highlightJson(json: string): string {
  const escaped = escapeHtml(json);

  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let className = 'json-number';
      if (/^"/.test(match)) {
        className = /:$/.test(match) ? 'json-key' : 'json-string';
      } else if (/true|false/.test(match)) {
        className = 'json-boolean';
      } else if (/null/.test(match)) {
        className = 'json-null';
      }
      return `<span class="${className}">${match}</span>`;
    },
  );
}
