export function looksLikeJSON(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

export function safeJSONParse(value: string):
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: unknown;
    } {
  try {
    return { success: true, data: JSON.parse(value) };
  } catch (error) {
    return { success: false, error };
  }
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}
