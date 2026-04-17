const WINDOWS_PATH = /[A-Za-z]:\\[^\s"'<>|`]+/g;
const UNIX_PATH = /(?<![A-Za-z0-9._-])\/(?:home|Users)\/[^\s"'<>`]+/g;

export interface PathRedactionResult {
  readonly text: string;
  readonly redactedCount: number;
}

/**
 * Replace absolute filesystem paths with `<PATH>`.
 *
 * Targets Windows drive paths and common Unix home roots (`/home/...`,
 * `/Users/...`) to avoid leaking the user's directory structure. Relative
 * paths are left untouched — they carry far less identifying info.
 */
export function redactPaths(text: string): PathRedactionResult {
  let redactedCount = 0;
  const replacer = (): string => {
    redactedCount += 1;
    return '<PATH>';
  };
  const step1 = text.replace(WINDOWS_PATH, replacer);
  const step2 = step1.replace(UNIX_PATH, replacer);
  return { text: step2, redactedCount };
}
