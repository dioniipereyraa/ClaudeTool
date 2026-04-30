import { type Command } from 'commander';

import { encodeProjectDir } from '../../core/paths.js';
import { describeSession, listProjectDirs, listSessionFiles } from '../../core/session.js';

interface ListOptions {
  readonly all: boolean;
  readonly project?: string;
}

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List Claude Code sessions')
    .option('--all', 'List sessions across all projects (not just current cwd)', false)
    .option('--project <dir>', 'List sessions for a specific project folder name')
    .action(async (opts: ListOptions) => {
      const projects = await resolveProjects(opts);
      if (projects.length === 0) {
        process.stderr.write('No matching project folders found in ~/.claude/projects/\n');
        return;
      }

      for (const projectDir of projects) {
        const files = await listSessionFiles(projectDir);
        const label = files.length === 1 ? 'session' : 'sessions';
        process.stdout.write(`\n# ${projectDir}  (${String(files.length)} ${label})\n`);

        for (const file of files) {
          const meta = await describeSession(file);
          const date = meta.startedAt !== undefined ? meta.startedAt.slice(0, 10) : '????-??-??';
          const preview =
            meta.firstUserText !== undefined ? ` — ${truncate(meta.firstUserText)}` : '';
          process.stdout.write(
            `  ${meta.sessionId}  [${date}] turns=${String(meta.turnCount)}${preview}\n`,
          );
        }
      }
    });
}

async function resolveProjects(opts: ListOptions): Promise<string[]> {
  if (opts.project !== undefined) {
    assertSafeProjectName(opts.project);
    return [opts.project];
  }
  if (opts.all) return listProjectDirs();
  return [encodeProjectDir(process.cwd())];
}

// `--project` is joined under `~/.claude/projects/`. Reject anything
// that would let the user list a directory above the projects root,
// even though the CLI is local and the user already has read access:
// the goal is documented behaviour, not silent traversal that prints
// unrelated files.
function assertSafeProjectName(name: string): void {
  if (name.length === 0) throw new Error('--project must be a non-empty folder name');
  if (name.includes('..')) throw new Error('--project must not contain `..` segments');
  if (name.includes('/') || name.includes('\\')) {
    throw new Error('--project must be a single folder name, not a path');
  }
  if (name.includes('\0')) throw new Error('--project contains a null byte');
}

function truncate(value: string, max = 60): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
