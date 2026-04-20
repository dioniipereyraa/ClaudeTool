// Pure helpers for naming the files we write under `.exportal/`.
// Kept in its own module so tests can import it without pulling in
// `vscode` (which is only resolvable inside the extension host).

export function buildExportTimestamp(date: Date = new Date()): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear().toString()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

export function slugify(raw: string): string {
  const base = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const trimmed = base.slice(0, 40).replace(/-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'conversacion';
}
