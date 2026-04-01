import type { ZodTypeAny } from "zod";

export function formatZodError(error: unknown): string {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return "Schema validation failed.";
  }

  const issues = Array.isArray(error.issues) ? error.issues : [];
  if (issues.length === 0) {
    return "Schema validation failed.";
  }

  return issues
    .map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

export function validateAgainstSchema<TSchema extends ZodTypeAny>(
  schema: TSchema,
  value: unknown
):
  | { success: true; data: TSchema["_output"] }
  | { success: false; message: string; error: unknown } {
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    message: formatZodError(result.error),
    error: result.error,
  };
}
