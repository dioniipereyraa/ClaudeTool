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

/**
 * Every HTML page we publish, with the canonical URL it must declare and
 * whether it carries a JSON-LD data block. The order is the sitemap's.
 */
const PAGES: readonly { file: string; canonical: string; data: boolean }[] = [
  { file: 'index.html', canonical: `${SITE}/`, data: true },
  { file: 'compare/index.html', canonical: `${SITE}/compare/`, data: true },
  {
    file: 'export-claude-chat-to-vscode/index.html',
    canonical: `${SITE}/export-claude-chat-to-vscode/`,
    data: true,
  },
  { file: 'privacy/index.html', canonical: `${SITE}/privacy/`, data: false },
  { file: 'support/index.html', canonical: `${SITE}/support/`, data: false },
];

const readPage = (file: string): string => readRepoFile('docs', ...file.split('/'));

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
      expect(readPage(page.file)).toContain(`<link rel="canonical" href="${page.canonical}">`);
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
  // Google requires the marked-up FAQ to match the visible one, and an
  // answer that exists only in the markup is an answer nobody maintains.
  // `node scripts/build-landing-jsonld.mjs` regenerates both blocks.
  const withFaq = PAGES.filter((page) => page.data).filter((page) =>
    readPage(page.file).includes('"FAQPage"'),
  );

  it('is present on the pages that have a visible FAQ', () => {
    expect(withFaq.map((page) => page.file)).toEqual([
      'index.html',
      'compare/index.html',
    ]);
  });

  for (const page of withFaq) {
    it(`docs/${page.file} mirrors its visible FAQ, question for question`, () => {
      const html = readPage(page.file);
      const visible = visibleFaq(html);
      const faqPage = nodeOfType(jsonLdGraph(html), 'FAQPage');

      expect(visible.length).toBeGreaterThan(0);
      expect(faqPage.mainEntity).toEqual(
        visible.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
      );
    });
  }
});

describe('HowTo structured data', () => {
  const guide = readPage('export-claude-chat-to-vscode/index.html');

  it('mirrors the numbered steps a human reads', () => {
    const list = /<ol class="steps">([\s\S]*?)<\/ol>/.exec(guide);
    const visible = [
      ...(list?.[1] ?? '').matchAll(/<li>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g),
    ].map((match, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: plainText(match[1] ?? ''),
      text: plainText(match[2] ?? ''),
    }));
    const howTo = nodeOfType(jsonLdGraph(guide), 'HowTo');

    expect(visible.length).toBeGreaterThan(0);
    expect(howTo.step).toEqual(visible);
  });

  it('points back at the product it describes', () => {
    const howTo = nodeOfType(jsonLdGraph(guide), 'HowTo');

    expect(howTo.about).toEqual({ '@id': `${SITE}/#exportal` });
  });
});

describe('internal linking', () => {
  it('never links to the bare path, which GitHub Pages answers with a 301', () => {
    // A canonical, a sitemap entry or a link pointing at /compare instead
    // of /compare/ costs a redirect on every visit, and a canonical that
    // resolves through a redirect is a canonical search engines discard.
    //
    // The two READMEs are in here because the baseline showed the repo,
    // not the landing, is what generative engines quote today: a bare
    // path in the README is the redirect they hand to a reader, and the
    // link text is what a model reads, so both halves need the slash.
    const routes = PAGES.map((page) => page.canonical.slice(SITE.length)).filter(
      (path) => path !== '/',
    );
    const sources = [
      ...PAGES.map((page) => `docs/${page.file}`),
      'docs/llms.txt',
      'docs/sitemap.xml',
      'README.md',
      'README.vsix.md',
    ];

    for (const file of sources) {
      const text = readRepoFile(...file.split('/'));
      for (const route of routes) {
        const bare = route.slice(0, -1);
        expect(text, `${file} should not point at ${bare}`).not.toMatch(
          new RegExp(`${bare}(?=["')\\]<\\s])`.replaceAll('/', '\\/')),
        );
      }
    }
  });

  it('leaves no page orphaned: the home page links to every other one', () => {
    // A page nothing links to is a page crawlers reach late and readers
    // never reach at all.
    for (const page of PAGES.filter((entry) => entry.canonical !== `${SITE}/`)) {
      const path = page.canonical.slice(SITE.length);
      expect(indexHtml, `docs/index.html should link to ${path}`).toContain(`href="${path}"`);
    }
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

describe('backing the project', () => {
  // Three files say where a reader can give: the landing (what a human
  // sees), .github/FUNDING.yml (what GitHub renders as the Sponsor
  // button) and the two READMEs (what the stores and the repo show).
  // They are edited by hand, so they drift unless something holds them
  // together. These tests are that something.

  /** The sponsor section of the landing, with its outbound links. */
  function sponsorSection(): { html: string; links: string[] } {
    const match = /<section id="sponsor"[\s\S]*?<\/section>/.exec(indexHtml);
    expect(match, 'docs/index.html should have a <section id="sponsor">').not.toBeNull();
    const html = match?.[0] ?? '';
    const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1] ?? '');
    return { html, links };
  }

  /** Every URL FUNDING.yml resolves to, in the order GitHub lists them. */
  function fundingLinks(): string[] {
    const yaml = readRepoFile('.github', 'FUNDING.yml');
    const active = yaml.split('\n').filter((line) => !line.trimStart().startsWith('#'));
    const links: string[] = [];
    for (const line of active) {
      const koFi = /^ko_fi:\s*(\S+)/.exec(line);
      if (koFi) links.push(`https://ko-fi.com/${koFi[1] ?? ''}`);
      const custom = /^custom:\s*\[(.*)\]/.exec(line);
      if (custom) {
        for (const entry of (custom[1] ?? '').split(',')) {
          const url = entry.trim().replace(/^['"]|['"]$/g, '');
          if (url.length > 0) links.push(url);
        }
      }
    }
    return links;
  }

  it('the landing has a sponsor section the footer links to', () => {
    const { html } = sponsorSection();
    expect(html).toMatch(/<h2[ >]/);
    expect(indexHtml).toContain('href="#sponsor"');
  });

  it('the sponsor section is reachable from the header and from right below the hero', () => {
    // A section at the bottom of a long page is a section nobody finds.
    const header = /<nav aria-label="Site">[\s\S]*?<\/nav>/.exec(indexHtml)?.[0] ?? '';
    expect(header, 'the site nav should link to #sponsor').toContain('href="#sponsor"');
    const betweenHeroAndNext = /<\/section>([\s\S]*?)<section id="under-the-hood"/.exec(
      indexHtml,
    )?.[1];
    expect(betweenHeroAndNext, 'something should sit between the hero and the next section').toBeDefined();
    expect(betweenHeroAndNext ?? '', 'the strip below the hero should link to #sponsor').toContain(
      'href="#sponsor"',
    );
  });

  it('every way to give has an icon, like the install buttons in the hero', () => {
    const { html } = sponsorSection();
    const cards = [...html.matchAll(/<a [^>]*href="(?:https?:|mailto:)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const card of cards) {
      expect(card[1] ?? '', `${card[0].slice(0, 60)} should carry an inline svg icon`).toContain('<svg');
    }
  });

  it('FUNDING.yml names at least one place to give', () => {
    expect(fundingLinks().length).toBeGreaterThan(0);
  });

  it('the landing and FUNDING.yml name the same places to give', () => {
    const { links } = sponsorSection();
    const funding = fundingLinks().filter((url) => !url.startsWith(SITE));
    // Every place GitHub advertises is on the landing...
    for (const url of funding) {
      expect(links, `docs/index.html should link to ${url}`).toContain(url);
    }
    // ...and the landing advertises nothing GitHub does not know about,
    // except links back into the project itself.
    const external = links.filter(
      (url) => !url.startsWith(SITE) && !url.startsWith('https://github.com/dioniipereyraa/'),
    );
    for (const url of external) {
      expect(funding, `.github/FUNDING.yml should list ${url}`).toContain(url);
    }
  });

  it('both READMEs point readers at the sponsor section', () => {
    for (const file of ['README.md', 'README.vsix.md']) {
      expect(readRepoFile(file), `${file} should link to ${SITE}/#sponsor`).toContain(
        `${SITE}/#sponsor`,
      );
    }
  });
});

describe('house style', () => {
  const files = [
    ...PAGES.map((page) => `docs/${page.file}`),
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
