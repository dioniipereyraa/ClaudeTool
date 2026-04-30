const WINDOWS_PATH = /[A-Za-z]:\\[^\s"'<>|`]+/g;
// Common absolute prefixes on Unix systems where the path beyond is
// likely identifying (home dirs) or environment-revealing (system
// dirs). The negative lookbehind avoids matching mid-URL or mid-path
// fragments (`https://example.com/etc/x` won't trip on `/etc/x`).
const UNIX_PATH = /(?<![A-Za-z0-9._-])\/(?:home|Users|var|etc|opt|srv|mnt|tmp)\/[^\s"'<>`]+/g;
// Tilde shortcut to the user's home — leaks the home shape even
// without the username. Same lookbehind protects against mid-token
// matches (e.g. `https://example.com/~user` is left alone).
const TILDE_PATH = /(?<![A-Za-z0-9._-])~\/[^\s"'<>`]+/g;

export interface PathRedactionResult {
  readonly text: string;
  readonly redactedCount: number;
}

/**
 * Replace absolute filesystem paths with `<PATH>`.
 *
 * Targets Windows drive paths, common Unix system/home roots
 * (`/home/`, `/Users/`, `/var/`, `/etc/`, `/opt/`, `/srv/`, `/mnt/`,
 * `/tmp/`), and the `~/` shorthand. Relative paths are left untouched
 * — they carry far less identifying info.
 */
export function redactPaths(text: string): PathRedactionResult {
  let redactedCount = 0;
  const replacer = (): string => {
    redactedCount += 1;
    return '<PATH>';
  };
  const step1 = text.replace(WINDOWS_PATH, replacer);
  const step2 = step1.replace(UNIX_PATH, replacer);
  const step3 = step2.replace(TILDE_PATH, replacer);
  return { text: step3, redactedCount };
}
