import { redactPaths } from './paths.js';
import { redactPii } from './pii.js';
import { redactSecrets } from './secrets.js';

export interface RedactionReport {
  paths: number;
  secrets: number;
  secretsByType: Record<string, number>;
  pii: number;
  piiByType: Record<string, number>;
}

export function emptyReport(): RedactionReport {
  return { paths: 0, secrets: 0, secretsByType: {}, pii: 0, piiByType: {} };
}

export interface RedactOptions {
  /**
   * When true, also redact PII patterns (email, IPv4, IPv6). Default
   * false. Threaded through the formatters via the `--redact-pii` CLI
   * flag. Not enabled in the extension by default.
   */
  readonly pii?: boolean;
}

/**
 * Apply all redactors in order, accumulating counts into the given report.
 *
 * Order matters: path redaction runs first so that a path embedded in a
 * secret-like pattern (unlikely but possible) gets sanitized cleanly.
 * Secrets run second. PII (email / IP) runs last so an email used as a
 * username in a connection string already-redacted by the secrets pass
 * does not get double-counted.
 */
export function redact(
  text: string,
  report: RedactionReport,
  options: RedactOptions = {},
): string {
  const afterPaths = redactPaths(text);
  const afterSecrets = redactSecrets(afterPaths.text);
  report.paths += afterPaths.redactedCount;
  report.secrets += afterSecrets.redactedCount;
  for (const [key, value] of Object.entries(afterSecrets.byType)) {
    report.secretsByType[key] = (report.secretsByType[key] ?? 0) + value;
  }
  if (options.pii !== true) return afterSecrets.text;
  const afterPii = redactPii(afterSecrets.text);
  report.pii += afterPii.redactedCount;
  for (const [key, value] of Object.entries(afterPii.byType)) {
    report.piiByType[key] = (report.piiByType[key] ?? 0) + value;
  }
  return afterPii.text;
}

export { redactPaths } from './paths.js';
export { redactPii } from './pii.js';
export { redactSecrets } from './secrets.js';
