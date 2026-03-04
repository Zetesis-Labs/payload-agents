# CLAUDE.md

## Project

TypeScript monorepo (pnpm workspaces + Turborepo) with 5 publishable npm packages under `@zetesis/`.

Open-source Payload CMS plugins extracted from ZetesisPortal.

## Type Isolation Architecture

Packages are compiled **isolated** from any app-level `payload-types.ts`. Inside packages, `CollectionSlug` resolves to `string`, not to an app's union type. Isolation is achieved with:

- `tsconfig.base.json` with `paths: {}` (intentionally empty)
- Project references to declare dependencies between packages
- `package.json` exports as the sole resolution mechanism

> Detail: [docs/architecture/typescript-monorepo-types.md](docs/architecture/typescript-monorepo-types.md)

## Cast Patterns

- Queries (`payload.find`): `as unknown as LocalInterface`
- Writes (`payload.create/update`): `as Record<string, unknown>`
- JSON boundaries: `JSON.parse() as Type`
- CSS custom properties: `as React.CSSProperties`
- Literals: `as const`

**Prohibited:**
- `as any` -- always use a typed alternative
- `eslint-disable` / `biome-ignore` to suppress type errors
- Generics `<T extends CollectionSlug>` or `<TConfig extends Config>` in isolated packages

> Detail: [docs/architecture/payload-cast-patterns.md](docs/architecture/payload-cast-patterns.md)

## npm Publishing

- Dual exports: `types->dist`, `import->src` (dev) / all->dist (npm via `publishConfig`)
- tsdown with `dts: { resolve: true }` for self-contained declarations
- Changesets for coordinated versioning and release
- `sideEffects: false` where applicable

> Detail: [docs/architecture/npm-publishability.md](docs/architecture/npm-publishability.md)

## Type Audit

To audit types of a package, follow the playbook manually.

> Playbook: [docs/architecture/type-audit-playbook.md](docs/architecture/type-audit-playbook.md)

## Packages

| Package | Entry points | Internal deps |
|---------|-------------|---------------|
| `payload-indexer` | `.` `.client` | -- |
| `payload-typesense` | `.` | payload-indexer |
| `payload-lexical-blocks-builder` | `.` `.builder` `.renderer` | -- |
| `payload-taxonomies` | `.` `.constants` | -- |
| `chat-agent` | `.` `.styles.css` | -- |

## Commands

```bash
# Build a package
pnpm --filter @zetesis/{pkg} build

# Type-check global (solution-style)
pnpm tsc --noEmit

# Build all packages
pnpm build

# Lint
pnpm lint

# Lint with autofix
pnpm lint:fix

# Test
pnpm test
```

## Conventions

- **No git without explicit instruction** -- NEVER run git commands (commit, add, push, checkout, branch, tag, etc.) or create PRs unless the user explicitly asks.
- **ESM only** -- `"type": "module"` in all packages
- **Biome** for linting and formatting (not ESLint, not Prettier)
- **Conventional commits** in English
- **No `as any`** -- always use a typed alternative
- **No `eslint-disable` / `biome-ignore`** -- fix the cause, not the symptom
- **pnpm** as package manager (v10)
- **Node 22.x+**
- **Changeset required before PR** -- run `pnpm changeset` and commit the generated file BEFORE creating a pull request.

## Self-correction workflow

After each significant change (new file, refactor, type change), run:

```bash
pnpm lint && pnpm tsc --noEmit
```

Fix errors immediately before continuing with the next change.
