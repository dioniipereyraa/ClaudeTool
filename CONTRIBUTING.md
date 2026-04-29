# Contributing to Exportal

Thanks for taking the time to look at this. Exportal is small but
takes contributions seriously — every PR gets read carefully, every
issue gets a response.

## Before you open something

- **Bug?** Skim [open issues](https://github.com/dioniipereyraa/ClaudeTool/issues)
  in case it's already there. If not, open a new one with the bug
  template — the pre-filled fields exist because they save back-and-forth.
- **Feature idea?** Same thing — search first, then open with the
  feature template. Check [`ROADMAP.md`](./ROADMAP.md) too: the project
  has explicit out-of-scope items (e.g. telemetry, automatic
  bidirectional sync) that won't change, and a backlog of accepted
  ideas waiting on triggers.
- **Question?** Use [Discussions](https://github.com/dioniipereyraa/ClaudeTool/discussions)
  if it's a usage question. Issues are for bugs and concrete features.

## Repo layout

Three deliverables live in one repo:

| Deliverable | Source | Build output |
|---|---|---|
| **VS Code extension** | `src/extension/` | `dist/extension/extension.cjs` |
| **CLI** (`npx exportal …`) | `src/cli/`, `src/core/` | `dist/cli/index.js` |
| **Chrome companion** | `chrome/` | `chrome/dist/` (built into a `.zip`) |

The VS Code extension and CLI share the core import/export logic in
`src/core/`. The Chrome companion is independent — it talks to the
VS Code extension through a **local HTTP loopback** on
`127.0.0.1`, paired by token. See [`SECURITY.md`](./SECURITY.md) for
the threat model.

## Dev setup

Requirements:

- Node.js ≥ 20
- VS Code ≥ 1.85 (for testing the extension)
- Google Chrome (for testing the companion)

```bash
git clone https://github.com/dioniipereyraa/ClaudeTool.git
cd ClaudeTool
npm install
```

Then:

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # compile to ./dist (CLI + extension bundle)
npm run ci          # all of the above in order
```

The full `ci` is what GitHub Actions runs; if it passes locally, your
PR is most of the way there.

## Running the extension locally

1. `npm run build` to compile the extension bundle.
2. Open this folder in VS Code.
3. Press **F5** — VS Code launches an Extension Development Host with
   the fresh build loaded. The status bar item, commands, and panel
   all work in the host window.
4. To test the bridge end-to-end:
   - In the host, run `Exportal: Show pairing token` and copy it.
   - Load the Chrome companion unpacked (`chrome://extensions` →
     Developer mode → Load unpacked → select `chrome/`).
   - Paste the token in the companion options page, or click
     "Copy and open Chrome" from VS Code.
   - Open a Claude.ai or ChatGPT chat. The FAB should appear.

## Running the CLI locally

```bash
npm run build
node dist/cli/index.js --help
```

Or, after `npm link`:

```bash
exportal --help
```

## Pull request process

1. Branch from `main`. Branch name doesn't matter much — descriptive
   is fine (`fix/redaction-edge-case`, `feat/gemini-import`, etc.).
2. Make your changes. Keep the PR focused — one concept per PR is
   easier to review than five mixed.
3. Run `npm run ci` locally. If it fails, fix it before submitting.
4. Update [`CHANGELOG.md`](./CHANGELOG.md) under an `Unreleased`
   section if your change is user-visible. Keep the format consistent
   with existing entries.
5. Update [`DEVLOG.md`](./DEVLOG.md) if your work involved a non-
   obvious decision worth preserving (the why, not the what — git
   already has the what).
6. Open the PR. Fill out the template. Reference the issue if it
   addresses one (`Closes #123`).

Reviews aim for the same day or next. Maintainer questions during
review are not a sign of rejection — they're how merges happen here.

## Commit messages

Loose convention, not enforced by hooks:

- `feat(scope): …` for new features.
- `fix(scope): …` for bug fixes.
- `docs: …` for documentation only.
- `chore(scope): …` for tooling, build, dependency updates.
- `refactor(scope): …` for behaviour-preserving code changes.

Scopes used in this repo: `companion` (Chrome), `extension` (VS Code),
`cli`, `core`, `importers`, `panel`, `pairing`, `landing`. Add new
scopes when they're meaningful.

Co-authored commits with Claude Code or other AI assistants are fine —
mark them with the standard `Co-Authored-By:` trailer so the credit
trail is honest.

## What we say no to

The project has explicit out-of-scope items in [`ROADMAP.md`](./ROADMAP.md):

- **Telemetry / analytics**: zero-network is a principle, not a
  preference. Won't change.
- **Automatic bidirectional sync**: violates zero-network and
  multiplies surface area for bugs.
- **At-rest encryption of exports**: the OS already provides FDE.
- **Multi-account claude.ai handling**: browsers handle this with
  profiles and containers.

PRs adding any of these will be closed with a pointer to the relevant
ROADMAP entry. None of this is personal — these decisions exist for
specific reasons documented in the project history.

## Code of conduct

By participating you agree to follow the
[Contributor Covenant](./CODE_OF_CONDUCT.md). The short version:
treat people with respect, assume good faith, focus on the work.

## License

By contributing you agree that your contribution will be licensed
under the [MIT License](./LICENSE), the same as the rest of the
project.
