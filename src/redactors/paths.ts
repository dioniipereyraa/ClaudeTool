const WINDOWS_PATH = /[A-Za-z]:\\[^\s"'<>|`]+/g;
// Windows UNC paths: `\\server\share\...`.
const UNC_PATH = /\\\\[^\\\s"'<>|`]+\\[^\s"'<>|`]+/g;
// Common absolute prefixes on Unix systems where the path beyond is
// likely identifying (home dirs) or environment-revealing (system
// dirs). The negative lookbehind avoids matching mid-URL or mid-path
// fragments (`https://example.com/etc/x` won't trip on `/etc/x`).
// macOS adds `/Volumes/` (external drives), `/private/` (FreeBSD-style
// root for /etc, /var, /tmp via firmlinks), `/root` for the root user
// home on Linux distros.
const UNIX_PATH = /(?<![A-Za-z0-9._-])\/(?:home|Users|var|etc|opt|srv|mnt|tmp|root|private|Volumes)\/[^\s"'<>`]+/g;
// `file://` URIs reveal full host paths.
const FILE_URI = /\bfile:\/\/\/?[^\s"'<>`]+/g;
// Tilde shortcut to the user's home, leaks the home shape even
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
 * Targets Windows drive paths, Windows UNC paths, common Unix
 * system/home roots (`/home/`, `/Users/`, `/var/`, `/etc/`, `/opt/`,
 * `/srv/`, `/mnt/`, `/tmp/`, `/root/`, `/private/`, `/Volumes/`),
 * `file://` URIs, and the `~/` shorthand. Relative paths are left
 * untouched, they carry far less identifying info.
 */
export function redactPaths(text: string): PathRedactionResult {
  let redactedCount = 0;
  const replacer = (): string => {
    redactedCount += 1;
    return '<PATH>';
  };
  // Order matters: UNC must run before single-backslash Windows
  // paths so the leading `\\` is consumed as part of the UNC prefix.
  // file:// runs before UNIX so the `/path` portion isn't matched
  // a second time.
  const step1 = text.replace(UNC_PATH, replacer);
  const step2 = step1.replace(WINDOWS_PATH, replacer);
  const step3 = step2.replace(FILE_URI, replacer);
  const step4 = step3.replace(UNIX_PATH, replacer);
  const step5 = step4.replace(TILDE_PATH, replacer);
  return { text: step5, redactedCount };
}
