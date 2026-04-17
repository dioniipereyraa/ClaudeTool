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
  if (opts.project !== undefined) return [opts.project];
  if (opts.all) return listProjectDirs();
  return [encodeProjectDir(process.cwd())];
}

function truncate(value: string, max = 60): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
