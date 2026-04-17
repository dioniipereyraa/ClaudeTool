import { redactPaths } from './paths.js';
import { redactSecrets } from './secrets.js';

export interface RedactionReport {
  paths: number;
  secrets: number;
  secretsByType: Record<string, number>;
}

export function emptyReport(): RedactionReport {
  return { paths: 0, secrets: 0, secretsByType: {} };
}

/**
 * Apply all redactors in order, accumulating counts into the given report.
 *
 * Order matters: path redaction runs first so that a path embedded in a
 * secret-like pattern (unlikely but possible) gets sanitized cleanly.
 */
export function redact(text: string, report: RedactionReport): string {
  const afterPaths = redactPaths(text);
  const afterSecrets = redactSecrets(afterPaths.text);
  report.paths += afterPaths.redactedCount;
  report.secrets += afterSecrets.redactedCount;
  for (const [key, value] of Object.entries(afterSecrets.byType)) {
    report.secretsByType[key] = (report.secretsByType[key] ?? 0) + value;
  }
  return afterSecrets.text;
}

export { redactPaths } from './paths.js';
export { redactSecrets } from './secrets.js';
