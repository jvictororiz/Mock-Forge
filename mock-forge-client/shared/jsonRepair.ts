import { isValidJson, prettifyJsonIfPossible, sanitizeJsonText } from './jsonFormat';

function removeJsonComments(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      result += ch;
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
      result += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }

    result += ch;
  }

  return result;
}

function normalizeSingleQuotes(text: string): string {
  let result = '';
  let inDouble = false;
  let inSingle = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inDouble) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }

    if (inSingle) {
      if (escaped) {
        result += ch;
        escaped = false;
      } else if (ch === '\\') {
        result += ch;
        escaped = true;
      } else if (ch === "'") {
        result += '"';
        inSingle = false;
      } else if (ch === '"') {
        result += '\\"';
      } else {
        result += ch;
      }
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      result += ch;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      result += '"';
      continue;
    }

    result += ch;
  }

  return result;
}

function quoteUnquotedKeys(text: string): string {
  return text.replace(
    /([{,]\s*)([A-Za-z_][\w$-]*)(\s*:)/g,
    '$1"$2"$3',
  );
}

function removeTrailingCommas(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      result += ch;
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
      result += ch;
      continue;
    }

    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const next = text[j];
      if (next === '}' || next === ']') {
        continue;
      }
    }

    result += ch;
  }

  return result;
}

function wrapBareObject(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return text;
  }

  if (/^["'A-Za-z_[{\[]/.test(trimmed) && (trimmed.includes(':') || trimmed.includes('"'))) {
    return `{${text}}`;
  }

  return text;
}

function balanceBrackets(text: string): string {
  const stack: Array<'{' | '['> = [];
  let result = '';
  let inString = false;
  let escaped = false;

  const prependOpener = (opener: '{' | '[') => {
    result = `${opener}${result}`;
    stack.unshift(opener);
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      result += ch;
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
      result += ch;
      continue;
    }

    if (ch === '{') {
      stack.push('{');
      result += ch;
      continue;
    }

    if (ch === '[') {
      stack.push('[');
      result += ch;
      continue;
    }

    if (ch === '}') {
      if (stack.length === 0) {
        prependOpener('{');
      } else if (stack[stack.length - 1] === '[') {
        result += ']';
        stack.pop();
        i -= 1;
        continue;
      }
      if (stack.length > 0 && stack[stack.length - 1] === '{') {
        stack.pop();
      }
      result += ch;
      continue;
    }

    if (ch === ']') {
      if (stack.length === 0) {
        prependOpener('[');
      } else if (stack[stack.length - 1] === '{') {
        result += '}';
        stack.pop();
        i -= 1;
        continue;
      }
      if (stack.length > 0 && stack[stack.length - 1] === '[') {
        stack.pop();
      }
      result += ch;
      continue;
    }

    result += ch;
  }

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    result += stack[i] === '{' ? '}' : ']';
  }

  return result;
}

function insertMissingCommas(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let afterValue = false;

  const peekNextNonSpace = (from: number): string => {
    let index = from;
    while (index < text.length && /\s/.test(text[index])) index += 1;
    return text.slice(index);
  };

  const startsKey = (slice: string): boolean => /^"(?:\\.|[^"\\])*"\s*:/.test(slice);
  const startsValue = (slice: string): boolean => (
    /^"/.test(slice)
    || /^[{[]/.test(slice)
    || /^-?\d/.test(slice)
    || /^(true|false|null)\b/.test(slice)
  );

  const shouldInsertComma = (from: number): boolean => {
    if (!afterValue) return false;
    const next = peekNextNonSpace(from);
    if (!next || next.startsWith(',') || next.startsWith('}') || next.startsWith(']')) {
      return false;
    }
    return startsKey(next) || startsValue(next);
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j += 1;
        afterValue = text[j] !== ':';
      }
      continue;
    }

    if (ch === '"') {
      if (shouldInsertComma(i)) {
        result += ',';
      }
      inString = true;
      result += ch;
      afterValue = false;
      continue;
    }

    if (ch === '{' || ch === '[') {
      if (shouldInsertComma(i)) {
        result += ',';
      }
      result += ch;
      afterValue = false;
      continue;
    }

    if (ch === '}' || ch === ']') {
      result += ch;
      afterValue = true;
      continue;
    }

    if (ch === ':') {
      result += ch;
      afterValue = false;
      continue;
    }

    if (ch === ',') {
      result += ch;
      afterValue = false;
      continue;
    }

    if (/[tfn0-9-]/.test(ch)) {
      if (shouldInsertComma(i)) {
        result += ',';
      }
      result += ch;
      if (/[0-9]/.test(ch)) {
        while (i + 1 < text.length && /[0-9.eE+-]/.test(text[i + 1])) {
          i += 1;
          result += text[i];
        }
      } else if (text.startsWith('true', i)) {
        result += text.slice(i + 1, i + 4);
        i += 3;
      } else if (text.startsWith('false', i)) {
        result += text.slice(i + 1, i + 5);
        i += 4;
      } else if (text.startsWith('null', i)) {
        result += text.slice(i + 1, i + 4);
        i += 3;
      }
      afterValue = true;
      continue;
    }

    result += ch;
  }

  return result;
}

const REPAIR_STEPS = [
  removeJsonComments,
  normalizeSingleQuotes,
  wrapBareObject,
  quoteUnquotedKeys,
  balanceBrackets,
  insertMissingCommas,
  removeTrailingCommas,
  balanceBrackets,
] as const;

function runRepairPipeline(text: string): string {
  let result = sanitizeJsonText(text);

  for (const step of REPAIR_STEPS) {
    result = step(result);
  }

  return result;
}

function uniqueCandidates(input: string): string[] {
  const base = sanitizeJsonText(input);
  const candidates = new Set<string>([base, runRepairPipeline(base)]);

  for (const step of REPAIR_STEPS) {
    const next = step(base);
    candidates.add(next);
    candidates.add(runRepairPipeline(next));
  }

  for (let i = 0; i < REPAIR_STEPS.length; i += 1) {
    let partial = base;
    for (let j = i; j < REPAIR_STEPS.length; j += 1) {
      partial = REPAIR_STEPS[j](partial);
      candidates.add(partial);
      candidates.add(runRepairPipeline(partial));
    }
  }

  return [...candidates];
}

export function repairJsonIfPossible(input: string): string | null {
  if (!input.trim()) return null;
  if (isValidJson(input)) return null;

  for (const candidate of uniqueCandidates(input)) {
    if (!candidate || !isValidJson(candidate)) continue;
    return prettifyJsonIfPossible(candidate);
  }

  return null;
}

export function canRepairJson(input: string): boolean {
  return repairJsonIfPossible(input) !== null;
}
