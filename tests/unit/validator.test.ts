import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  formatZodError,
  validateAgainstSchema,
} from "../../src/core/validator.js";

describe("validateAgainstSchema", () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it("returns parsed data on success", () => {
    const result = validateAgainstSchema(schema, { name: "Ada", age: 36 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Ada", age: 36 });
    }
  });

  it("returns a readable message on failure", () => {
    const result = validateAgainstSchema(schema, { name: "Ada", age: "36" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain("age");
    }
  });

  it("formats zod errors", () => {
    const parsed = schema.safeParse({ name: 1, age: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(formatZodError(parsed.error)).toContain("name");
    }
  });
});
