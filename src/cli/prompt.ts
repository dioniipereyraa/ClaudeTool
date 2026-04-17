import { createInterface } from 'node:readline/promises';

/**
 * Ask the user a yes/no question on stderr.
 *
 * Defaults to **No** — only an explicit `y` / `yes` (case-insensitive)
 * returns `true`. Empty input, Ctrl+C, or any other answer returns
 * `false`. This mirrors the redactor's fail-closed posture: the user has
 * to opt *in* to a destructive or surprising action, never out of one.
 *
 * Prompts are written to stderr so stdout stays clean for piping.
 */
export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question} [y/N]: `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Whether stdin is attached to an interactive terminal. Used to avoid
 * hanging on a prompt when the tool is invoked from a pipe or CI runner.
 */
export function stdinIsTTY(): boolean {
  return process.stdin.isTTY === true;
}
