import {Scrubber} from '@heroku/js-blanket'

/** Replacement token for scrubbed values. */
export const SCRUBBED = '[SCRUBBED]'

/**
 * Inline credential patterns scrubbed from string content (e.g. an
 * `Authorization` header value echoed into an error message). The token runs to
 * the next whitespace or quote so the whole credential is removed, not just the
 * leading run of "safe" characters. Bare tokens with no scheme prefix are
 * intentionally not matched here — they're caught by the value-based pass when
 * the caller supplies them as sensitive values.
 */
const VALUE_PATTERNS: readonly RegExp[] = [/\b(?:Bearer|Basic)\s+[^\s"']+/gi]

/**
 * Shared pattern scrubber for the login error path. Only `patterns` is set:
 * every caller hands {@link scrubText} a plain string, which is wrapped as a
 * single `{message}` object, and js-blanket field matching keys on object key
 * names — never string leaves — so a `fields` config would be inert here.
 * Removing sensitive content from string input is done by this pattern pass
 * plus the caller-enumerated value variants, not by field-name matching.
 */
const scrubber = new Scrubber({
  fields: [],
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
 * variants, then runs the shared js-blanket scrubber so inline `Bearer`/`Basic`
 * credentials are also removed. `variants` is pre-expanded via
 * {@link sensitiveVariants} so a batch of fields can reuse one expansion.
 *
 * The pattern pass is a scheme-prefixed backstop only — it does NOT catch a raw,
 * un-prefixed secret. Callers MUST pass every live credential through `variants`
 * (via {@link sensitiveVariants}); the pattern pass is not a safety net for
 * secrets the caller failed to enumerate.
 */
export function scrubText(text: string, variants: readonly string[]): string {
  let scrubbed = text
  for (const value of variants) {
    // A caller that builds variants by hand (not via sensitiveVariants) could
    // pass an empty string; replaceAll('', …) injects SCRUBBED between every
    // character, so guard against it here as well.
    if (!value) continue
    scrubbed = scrubbed.replaceAll(value, SCRUBBED)
  }

  // Wrap in a benign (non-sensitive) key so js-blanket's pattern pass runs over
  // the string content; the `message` key matches no configured field.
  return scrubber.scrub({message: scrubbed}).data.message
}
