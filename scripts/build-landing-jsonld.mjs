// Regenerate the JSON-LD data blocks on the landing pages.
//
// The parts a machine reads have to say the same thing as the parts a human
// reads, and nothing on screen breaks when they stop matching. So the FAQ
// entries and the how-to steps are derived from the published HTML itself,
// and the product facts come from `package.json`. Run this after editing a
// FAQ answer, a step, or the version:
//
//     node scripts/build-landing-jsonld.mjs
//
// `tests/docs/landing-metadata.test.ts` fails if the tree is left out of
// sync, so a forgotten run is a red CI, not a lie on the site.

import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SITE = 'https://exportal.dev';
const AUTHOR_ID = `${SITE}/#author`;
const APP_ID = `${SITE}/#exportal`;

const START = '<!-- structured-data:start -->';
const END = '<!-- structured-data:end -->';

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

/** Strips tags and decodes the handful of entities the landing uses. */
function plainText(html) {
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

/** Every <details> block on the page, as schema.org Questions. */
function questionsFrom(html) {
  const pattern =
    /<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g;
  return [...html.matchAll(pattern)].map((match) => ({
    '@type': 'Question',
    name: plainText(match[1]),
    acceptedAnswer: { '@type': 'Answer', text: plainText(match[2]) },
  }));
}

/** Every <li> of an <ol class="steps">, as schema.org HowToSteps. */
function stepsFrom(html) {
  const list = /<ol class="steps">([\s\S]*?)<\/ol>/.exec(html);
  if (!list) return [];
  const pattern = /<li>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g;
  return [...list[1].matchAll(pattern)].map((match, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    name: plainText(match[1]),
    text: plainText(match[2]),
  }));
}

function breadcrumb(name, url) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Exportal', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name, item: url },
    ],
  };
}

const author = {
  '@type': 'Person',
  '@id': AUTHOR_ID,
  name: 'Dionisio Pereyra Bocchio',
  url: 'https://github.com/dioniipereyraa',
  sameAs: ['https://github.com/dioniipereyraa'],
};

const application = {
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: 'Exportal',
  url: `${SITE}/`,
  description:
    'Bidirectional bridge between claude.ai, ChatGPT and Claude Code in VS Code. Exports an ' +
    'AI conversation to Markdown in your workspace with one click and attaches it to Claude ' +
    'Code as an @-mention, and sends a Claude Code session back to the web chat.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Windows, macOS, Linux',
  softwareVersion: pkg.version,
  softwareRequirements:
    'Visual Studio Code 1.85 or newer, plus a Chromium-based browser for the companion extension',
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  codeRepository: 'https://github.com/dioniipereyraa/ClaudeTool',
  installUrl: [
    'https://marketplace.visualstudio.com/items?itemName=dioniipereyraa.exportal',
    'https://chromewebstore.google.com/detail/exportal-companion/lmnmekfphhpfaciehfdaonjfchbicdnm',
  ],
  screenshot: `${SITE}/screenshots/exportal-s6-chatgpt-1280x800.png`,
  featureList: [
    'One-click export of a claude.ai, Claude Design or ChatGPT conversation to Markdown in your VS Code workspace',
    'Auto-attaches the exported Markdown to Claude Code as an @-mention',
    'Sends a Claude Code session back to claude.ai or ChatGPT through the clipboard',
    'Imports the official claude.ai and ChatGPT data export ZIP',
    "Optional .jsonl session so an imported chat shows up in Claude Code's /resume",
    'Secret and filesystem path redaction on by default, with an explicit opt-out',
    'Local-first: the bridge listens on 127.0.0.1 and the product makes no other network calls',
  ],
  author: { '@id': AUTHOR_ID },
  maintainer: { '@id': AUTHOR_ID },
};

/** One entry per page that carries a data block. */
const PAGES = [
  {
    file: 'docs/index.html',
    graph: (html) => [
      application,
      author,
      { '@type': 'FAQPage', '@id': `${SITE}/#faq`, mainEntity: questionsFrom(html) },
    ],
  },
  {
    file: 'docs/export-claude-chat-to-vscode/index.html',
    graph: (html) => [
      {
        '@type': 'HowTo',
        '@id': `${SITE}/export-claude-chat-to-vscode#howto`,
        name: 'How to export a Claude.ai or ChatGPT chat into VS Code',
        description:
          'Install the Exportal VS Code extension and browser companion, pair them once, and ' +
          'send any conversation to your workspace as Markdown attached to Claude Code.',
        tool: [
          { '@type': 'HowToTool', name: 'Visual Studio Code 1.85 or newer' },
          { '@type': 'HowToTool', name: 'A Chromium-based browser' },
        ],
        step: stepsFrom(html),
        author: { '@id': AUTHOR_ID },
        about: { '@id': APP_ID },
      },
      breadcrumb('Guide', `${SITE}/export-claude-chat-to-vscode`),
    ],
  },
  {
    file: 'docs/compare/index.html',
    graph: (html) => [
      {
        '@type': 'FAQPage',
        '@id': `${SITE}/compare#faq`,
        name: 'How Exportal compares to other chat exporters',
        about: { '@id': APP_ID },
        author: { '@id': AUTHOR_ID },
        mainEntity: questionsFrom(html),
      },
      breadcrumb('Compare', `${SITE}/compare`),
    ],
  },
];

for (const page of PAGES) {
  const path = join(root, page.file);
  const html = await readFile(path, 'utf8');

  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error(`${page.file}: missing the structured-data markers`);
  }

  const graph = page.graph(html);
  for (const node of graph) {
    if (Array.isArray(node.mainEntity) && node.mainEntity.length === 0) {
      throw new Error(`${page.file}: a FAQPage with no questions, check the <details> markup`);
    }
    if (Array.isArray(node.step) && node.step.length === 0) {
      throw new Error(`${page.file}: a HowTo with no steps, check the <ol class="steps"> markup`);
    }
  }

  // `</` is escaped so the payload can never close its own <script> element.
  const payload = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
    .replaceAll('</', '<\\/');
  const block = `${START}\n<script type="application/ld+json">\n${payload}\n</script>\n${END}`;

  await writeFile(path, html.slice(0, start) + block + html.slice(end + END.length), 'utf8');
  const kinds = graph.map((node) => node['@type']).join(', ');
  console.log(`${page.file}: ${kinds}`);
}
