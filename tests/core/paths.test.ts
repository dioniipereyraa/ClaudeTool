import { describe, expect, it } from 'vitest';

import { encodeProjectDir } from '../../src/core/paths.js';

describe('encodeProjectDir', () => {
  it('encodes Windows paths with drive letter and backslashes', () => {
    expect(encodeProjectDir('d:\\Dionisio\\ClaudeTool')).toBe('d--Dionisio-ClaudeTool');
  });

  it('encodes paths containing dots', () => {
    expect(encodeProjectDir('c:\\Apps\\BeamNG.drive\\mods')).toBe('c--Apps-BeamNG-drive-mods');
  });

  it('encodes Unix-style paths', () => {
    expect(encodeProjectDir('/home/dioni/proyecto')).toBe('-home-dioni-proyecto');
  });
});
