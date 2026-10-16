import {HEROKU_FIELDS, Scrubber} from '@heroku/js-blanket'

/** Replacement token for scrubbed values. */
export const SCRUBBED = '[SCRUBBED]'

/**
 * Extra sensitive field names the HEROKU_FIELDS preset doesn't cover. Matched
 * case-insensitively as substrings of a key, so `otp` also covers `otp_code`.
 */
const EXTRA_FIELDS: readonly string[] = ['otp', 'sso', 'second_factor', 'secondfactor']

/**
 * Inline credential patterns scrubbed from string content (e.g. an
 * `Authorization` header value echoed into an error message). Bare tokens with
 * no scheme prefix are intentionally not matched here — they're caught by the
 * value-based pass when the caller supplies them as sensitive values.
 */
const VALUE_PATTERNS: readonly RegExp[] = [/\b(?:Bearer|Basic)\s+[\w.~+/=-]+/gi]

/**
 * Shared field/pattern scrubber. Field-based matching catches sensitive keys at
 * any depth; pattern-based matching catches inline credentials in string leaves.
 */
const scrubber = new Scrubber({
  fields: [...HEROKU_FIELDS, ...EXTRA_FIELDS],
  patterns: [...VALUE_PATTERNS],
  replacement: SCRUBBED,
})

/**
 * Expand sensitive values into the variants that may appear in serialized text:
 * the raw value, newline-normalized (`\n`) and CRLF (`\r\n`) forms, and the
 * base64 encoding of each. Deduped and sorted longest-first so overlapping
 * values scrub completely rather than leaving a dangling suffix.
 */
export function sensitiveVariants(sensitiveValues: readonly string[]): string[] {
  return [...new Set(sensitiveValues.flatMap(value => {
    const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
    const crlfNormalized = normalized.replaceAll('\n', '\r\n')
    return [value, normalized, crlfNormalized].flatMap(variant => [variant, Buffer.from(variant, 'utf8').toString('base64')])
  }).filter(Boolean))].sort((left, right) => right.length - left.length)
}

/**
 * Scrub a string for public output. First removes the supplied sensitive-value
 * variants, then runs the shared js-blanket scrubber so inline credentials
 * (e.g. `Bearer <token>`) and known sensitive content the caller didn't
 * enumerate are also removed. `variants` is pre-expanded via
 * {@link sensitiveVariants} so a batch of fields can reuse one expansion.
 */
export function scrubText(text: string, variants: readonly string[]): string {
  let scrubbed = text
  for (const value of variants) scrubbed = scrubbed.replaceAll(value, SCRUBBED)
  // Wrap in a benign (non-sensitive) key so js-blanket's pattern pass runs over
  // the string content; the `message` key matches no configured field.
  return scrubber.scrub({message: scrubbed}).data.message
}
