import { sanitizeJsonText } from '../../shared/jsonFormat';

export interface JsonErrorLocation {
  offset: number;
  line: number;
  column: number;
  message: string;
}

function offsetToLocation(text: string, offset: number, message: string): JsonErrorLocation {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safeOffset);
  const line = before.split('\n').length - 1;
  const column = safeOffset - (before.lastIndexOf('\n') + 1);

  return {
    offset: safeOffset,
    line,
    column,
    message,
  };
}

function extractParseErrorOffset(message: string, text: string): number | null {
  const positionMatch = message.match(/position (\d+)/i);
  if (positionMatch) {
    return Number(positionMatch[1]);
  }

  const lineColumnMatch = message.match(/line (\d+) column (\d+)/i);
  if (lineColumnMatch) {
    const targetLine = Number(lineColumnMatch[1]) - 1;
    const targetColumn = Number(lineColumnMatch[2]) - 1;
    const lines = text.split('\n');
    let offset = 0;

    for (let i = 0; i < targetLine; i += 1) {
      offset += (lines[i]?.length ?? 0) + 1;
    }

    return offset + targetColumn;
  }

  return null;
}

function findParseError(text: string): JsonErrorLocation | null {
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON inválido';
    const offset = extractParseErrorOffset(message, text);
    if (offset === null) {
      return offsetToLocation(text, 0, message);
    }
    return offsetToLocation(text, offset, message);
  }
}

function findBracketMismatchErrors(text: string): JsonErrorLocation[] {
  const errors: JsonErrorLocation[] = [];
  const stack: Array<{ offset: number; char: '{' | '[' }> = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push({ offset: i, char: ch });
      continue;
    }

    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (!open) {
        errors.push(offsetToLocation(text, i, 'Colchete ou chave de fechamento inesperado'));
      }
    }
  }

  for (const open of stack) {
    errors.push(offsetToLocation(text, open.offset, 'Colchete ou chave não fechado'));
  }

  return errors;
}

function dedupeErrors(errors: JsonErrorLocation[]): JsonErrorLocation[] {
  const sorted = [...errors].sort((a, b) => a.offset - b.offset);
  const unique: JsonErrorLocation[] = [];

  for (const error of sorted) {
    const last = unique[unique.length - 1];
    if (last && Math.abs(last.offset - error.offset) <= 2 && last.line === error.line) {
      continue;
    }
    unique.push(error);
  }

  return unique;
}

export function findJsonErrorLocations(input: string): JsonErrorLocation[] {
  const trimmed = sanitizeJsonText(input);
  if (!trimmed) return [];

  const leadingOffset = input.length - input.trimStart().length;
  const errors: JsonErrorLocation[] = [];
  const parseError = findParseError(trimmed);
  if (parseError) {
    errors.push({
      ...parseError,
      offset: parseError.offset + leadingOffset,
    });
  }

  errors.push(...findBracketMismatchErrors(input));

  return dedupeErrors(errors);
}
