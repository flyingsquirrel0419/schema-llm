import { safeJSONParse } from "../utils/json-utils.js";

function removeComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,(\s*[}\]])/g, "$1");
}

function replaceSingleQuotedStrings(input: string): string {
  return input.replace(
    /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
    (_, value: string) => `"${value.replace(/"/g, '\\"')}"`
  );
}

function quoteUnquotedKeys(input: string): string {
  return input.replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
}

function replaceUndefinedValues(input: string): string {
  return input.replace(/:\s*undefined(\s*[,}\]])/g, ": null$1");
}

function stripEllipsis(input: string): string {
  return input.replace(/\[\s*\.\.\.\s*\]/g, "[]").replace(/\.\.\./g, "");
}

function escapeBareBackslashes(input: string): string {
  let output = "";
  let inString = false;
  let quoteChar = '"';

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if ((char === '"' || char === "'") && !inString) {
      if (!inString) {
        inString = true;
        quoteChar = char;
      }
      output += char;
      continue;
    }

    if (char === "\\" && inString) {
      const next = input[index + 1];
      const afterNext = input.slice(index + 2);

      if (!next) {
        output += "\\\\";
        continue;
      }

      if (next === quoteChar) {
        const trailing = afterNext.trimStart();
        if (
          trailing.length === 0 ||
          trailing.startsWith("}") ||
          trailing.startsWith("]") ||
          trailing.startsWith(",")
        ) {
          output += "\\\\";
          continue;
        }
      }

      if (/["\\/bfnrtu]/.test(next)) {
        output += `\\${next}`;
        index += 1;
        continue;
      }

      output += "\\\\";
      continue;
    }

    if ((char === '"' || char === "'") && inString && quoteChar === char) {
      inString = false;
    }

    output += char;
  }

  return output;
}

function closeOpenString(input: string): string {
  let doubleQuotes = 0;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      doubleQuotes += 1;
    }
  }

  return doubleQuotes % 2 === 1 ? `${input}"` : input;
}

function closeOpenStructures(input: string): string {
  let output = input;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      stack.push("}");
    } else if (char === "[") {
      stack.push("]");
    } else if ((char === "}" || char === "]") && stack.at(-1) === char) {
      stack.pop();
    }
  }

  while (stack.length > 0) {
    output += stack.pop();
  }

  return output;
}

const repairPipeline = [
  removeComments,
  stripEllipsis,
  removeTrailingCommas,
  replaceSingleQuotedStrings,
  quoteUnquotedKeys,
  replaceUndefinedValues,
  escapeBareBackslashes,
  closeOpenString,
  closeOpenStructures,
];

export function repairJSON(input: string): string | null {
  if (safeJSONParse(input).success) {
    return input;
  }

  let repaired = input;
  for (const repair of repairPipeline) {
    repaired = repair(repaired);
    if (safeJSONParse(repaired).success) {
      return repaired;
    }
  }

  return null;
}
