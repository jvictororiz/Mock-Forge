const BODY_TEMPLATE = /\{\{request\.body\.([^}]+)\}\}/g;
const HEADER_TEMPLATE = /\{\{request\.headers\.([^}]+)\}\}/g;

export function containsResponseTemplates(body: string): boolean {
  return /\{\{request\.body\.[^}]+\}\}/.test(body)
    || /\{\{request\.headers\.[^}]+\}\}/.test(body);
}

function toJsonPath(field: string): string {
  const trimmed = field.trim();
  if (!trimmed) return '$';
  if (trimmed.startsWith('$.')) return trimmed;
  const segments = trimmed.split('.').filter(Boolean);
  return `$.${segments.join('.')}`;
}

/** Converts MockForge `{{request.body.*}}` / `{{request.headers.*}}` to MockServer Mustache. */
export function applyResponseTemplating(body: string): string {
  return body
    .replace(BODY_TEMPLATE, (_match, field: string) => `{{{jsonPath request.body '${toJsonPath(field)}'}}}`)
    .replace(HEADER_TEMPLATE, (_match, header: string) => `{{{request.headers.${header.trim()}}}}`);
}
