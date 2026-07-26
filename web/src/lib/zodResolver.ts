import type { FieldError, FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * Minimal Zod → react-hook-form resolver.
 *
 * Written in-house because @hookform/resolvers currently ships a broken
 * optional-peer-dependency graph (conflicting valibot ranges) that fails a
 * clean `npm install`. Our forms are flat objects, which makes the adapter
 * ~20 lines — and one less dependency to audit.
 *
 * Limitation (fine here): error paths are joined with ".", so deeply nested
 * array fields would need the upstream package's nested-error shaping.
 */
export function zodResolver<Schema extends z.ZodType<FieldValues, FieldValues>>(
  schema: Schema,
): Resolver<z.input<Schema>, unknown, z.output<Schema>> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);

    if (result.success) {
      return { values: result.data as z.output<Schema>, errors: {} };
    }

    const errors: Record<string, FieldError> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.') || 'root';
      // Keep only the first error per field — matches upstream behavior.
      errors[path] ??= { type: issue.code, message: issue.message };
    }

    // The dynamic Record must be cast to RHF's field-mapped error type —
    // the upstream package performs the same internal cast.
    return { values: {}, errors: errors as FieldErrors<z.input<Schema>> };
  };
}
