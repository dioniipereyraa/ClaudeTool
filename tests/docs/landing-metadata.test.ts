import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The landing page carries the machine-readable half of the site: the
 * JSON-LD that search engines and generative engines parse, one
 * canonical URL per page, the sitemap and llms.txt.
 *
 * None of it is visible, so nothing on screen breaks when it drifts
 * away from what the page actually says or from what the product
 * actually is. That is exactly how the "PII is redacted" claim on the
 * landing outlived the code that did it. These tests are the invariant
 * that keeps the invisible copy honest.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readRepoFile = (...parts: string[]): string =>
  readFileSync(path.join(repoRoot, ...parts), 'utf8');

const SITE = 'https://exportal.dev';

/** Every HTML page we publish, with the canonical URL it must declare. */
const PAGES: readonly { file: string; canonical: string }[] = [
  { file: 'index.html', canonical: `${SITE}/` },
  { file: 'privacy/index.html', canonical: `${SITE}/privacy` },
  { file: 'support/index.html', canonical: `${SITE}/support` },
];

interface FaqEntry {
  readonly question: string;
  readonly answer: string;
}

/** A node of the JSON-LD @graph. Values stay `unknown` on purpose. */
interface LdNode {
  readonly '@type': string;
  readonly [key: string]: unknown;
}

/** Strips tags and decodes the handful of entities the landing uses. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The FAQ a human sees: every <details> in the page. */
function visibleFaq(html: string): FaqEntry[] {
  const pattern = /<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g;
  return [...html.matchAll(pattern)].map((match) => ({
    question: plainText(match[1] ?? ''),
    answer: plainText(match[2] ?? ''),
  }));
}

/** The single JSON-LD data block on a page, parsed. */
function jsonLdGraph(html: string): LdNode[] {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(blocks).toHaveLength(1);
  const parsed = JSON.parse(blocks[0]?.[1] ?? '') as { '@graph': LdNode[] };
  expect(Array.isArray(parsed['@graph'])).toBe(true);
  return parsed['@graph'];
}

function nodeOfType(graph: LdNode[], type: string): LdNode {
  const node = graph.find((entry) => entry['@type'] === type);
  if (!node) {
    throw new Error(`expected a ${type} node in the JSON-LD @graph`);
  }
  return node;
}

const indexHtml = readRepoFile('docs', 'index.html');

describe('canonical URLs', () => {
  for (const page of PAGES) {
    it(`docs/${page.file} declares its canonical URL`, () => {
      const html = readRepoFile('docs', ...page.file.split('/'));
      expect(html).toContain(`<link rel="canonical" href="${page.canonical}">`);
    });
  }
});

describe('JSON-LD on the landing page', () => {
  it('describes the product as a free MIT application', () => {
    const app = nodeOfType(jsonLdGraph(indexHtml), 'SoftwareApplication');

    expect(app.name).toBe('Exportal');
    expect(app.applicationCategory).toBe('DeveloperApplication');
    expect(app.license).toBe('https://opensource.org/licenses/MIT');
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
  });

  it('points at every place the product actually ships', () => {
    const app = nodeOfType(jsonLdGraph(indexHtml), 'SoftwareApplication');

    expect(app.installUrl).toEqual([
      'https://marketplace.visualstudio.com/items?itemName=dioniipereyraa.exportal',
      'https://chromewebstore.google.com/detail/exportal-companion/lmnmekfphhpfaciehfdaonjfchbicdnm',
    ]);
    expect(app.codeRepository).toBe('https://github.com/dioniipereyraa/ClaudeTool');
  });

  it('states the version that is actually published', () => {
    // A version in the markup is a citable fact, which is the point,
    // and a lie the moment a release forgets to bump it. The release
    // checklist in CLAUDE.md lists this file; this test enforces it.
    const app = nodeOfType(jsonLdGraph(indexHtml), 'SoftwareApplication');
    const pkg = JSON.parse(readRepoFile('package.json')) as { version: string };

    expect(app.softwareVersion).toBe(pkg.version);
  });

  it('credits the author once, by reference', () => {
    const graph = jsonLdGraph(indexHtml);
    const person = nodeOfType(graph, 'Person');
    const app = nodeOfType(graph, 'SoftwareApplication');

    expect(person.name).toBe('Dionisio Pereyra Bocchio');
    expect(person['@id']).toBe(`${SITE}/#author`);
    expect(app.author).toEqual({ '@id': `${SITE}/#author` });
  });
});

describe('FAQ structured data', () => {
  it('mirrors the FAQ a human reads, question for question', () => {
    // Google requires the marked-up FAQ to match the visible one, and
    // an answer that only exists in the markup is an answer nobody
    // maintains.
    const visible = visibleFaq(indexHtml);
    const faqPage = nodeOfType(jsonLdGraph(indexHtml), 'FAQPage');

    expect(visible.length).toBeGreaterThan(0);
    expect(faqPage.mainEntity).toEqual(
      visible.map((entry) => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: { '@type': 'Answer', text: entry.answer },
      })),
    );
  });
});

describe('sitemap.xml', () => {
  const sitemap = readRepoFile('docs', 'sitemap.xml');

  it('lists every published page and nothing else', () => {
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');

    expect(listed).toEqual(PAGES.map((page) => page.canonical));
  });

  it('carries a plausible lastmod for each page', () => {
    // A lastmod older than the page it describes teaches crawlers to
    // ignore the field altogether.
    const stamps = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(
      (match) => match[1] ?? '',
    );

    expect(stamps).toHaveLength(PAGES.length);
    for (const stamp of stamps) {
      expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(stamp >= '2026-09-07').toBe(true);
    }
  });
});

describe('llms.txt', () => {
  const llms = readRepoFile('docs', 'llms.txt');

  it('follows the convention: an H1, a summary blockquote, then sections', () => {
    expect(llms.split('\n')[0]).toBe('# Exportal');
    expect(llms).toMatch(/\n> \S/);
    expect(llms).toMatch(/\n## /);
  });

  it('only links to the project and its stores', () => {
    const hosts = [...llms.matchAll(/https?:\/\/([^/)\s]+)/g)].map((match) => match[1] ?? '');

    expect(hosts.length).toBeGreaterThan(0);
    expect([...new Set(hosts)].sort()).toEqual([
      'chromewebstore.google.com',
      'exportal.dev',
      'github.com',
      'marketplace.visualstudio.com',
      'opensource.org',
    ]);
  });

  it('says out loud that the project is not affiliated with Anthropic or OpenAI', () => {
    // An LLM that reads this file and then answers a question about
    // Exportal must not be able to imply that it is an official tool.
    expect(llms).toMatch(/not affiliated/i);
  });
});

describe('house style', () => {
  const files = [
    'docs/index.html',
    'docs/privacy/index.html',
    'docs/support/index.html',
    'docs/llms.txt',
    'docs/sitemap.xml',
    'docs/robots.txt',
  ];

  for (const file of files) {
    it(`${file} has no em dashes`, () => {
      expect(readRepoFile(...file.split('/'))).not.toContain('—');
    });
  }
});
