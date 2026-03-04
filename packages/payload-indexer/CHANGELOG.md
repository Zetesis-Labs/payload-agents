# @nexo-labs/payload-indexer

## 1.15.0

### Minor Changes

- [`1e9c31e`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/1e9c31e490094d0fcfb52a3e54ca226035b158d9) - fix: issue with the production environement backend working

## 1.14.9

### Patch Changes

- [#111](https://github.com/Zetesis-Labs/ZetesisPortal/pull/111) [`df3f1f9`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/df3f1f91ed64b5de8f22625095883aff90509e67) Thanks [@Fiser12](https://github.com/Fiser12)! - Add `@payloadcms/ui` to tsdown external config to prevent bundling duplicate React contexts

## 1.14.8

### Patch Changes

- [`ff84b83`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/ff84b830d8545790f45cadec5850c53ae0caa4e1) -

## 1.14.7

### Patch Changes

- [#104](https://github.com/Zetesis-Labs/ZetesisPortal/pull/104) [`7b8598f`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/7b8598ff0fdc5afb44cf9048bcfb3a8140611b47) Thanks [@Fiser12](https://github.com/Fiser12)! - Add sync status virtual field with admin UI components (SyncStatusCell, SyncStatusField) and manual sync trigger endpoint

## 1.14.6

### Patch Changes

- [#100](https://github.com/Zetesis-Labs/ZetesisPortal/pull/100) [`f0feddb`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/f0feddb60ad860cbd1c9840cc3d6d52296330c13) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: redirect logout directly to Keycloak and add anti-cache headers to auth endpoints

- [#102](https://github.com/Zetesis-Labs/ZetesisPortal/pull/102) [`4c83898`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/4c83898f84a73c1507b27f1fa880dd894ef43092) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: simplify logout buttons to use direct navigation instead of fetch POST

- [#102](https://github.com/Zetesis-Labs/ZetesisPortal/pull/102) [`e4f15ab`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/e4f15ab185806743ca6d5f8fcaffeb71d89dd820) Thanks [@Fiser12](https://github.com/Fiser12)! - feat: skip re-embedding when content unchanged via SHA-256 content hash

## 1.14.5

### Patch Changes

- [#95](https://github.com/Zetesis-Labs/ZetesisPortal/pull/95) [`ddf28ef`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/ddf28efd6cb3f1deb1cbc8b84e6132dc059ac0e4) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: coerce ISO date strings to unix timestamps for int64 fields in Typesense sync, and make publishedAt optional in Typesense schema

## 1.14.4

### Patch Changes

- [#92](https://github.com/Zetesis-Labs/ZetesisPortal/pull/92) [`8a56b82`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/8a56b82b28f5f913274f87417bab0126cb5aa926) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: simplify collection importers — remove agent-level importer and dashboard widget, fix collection detection with usePathname, make publishedAt optional on Posts, improve error logging in post seeder

## 1.14.3

### Patch Changes

- [`62de0dc`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/62de0dcd1f159434756f02fdf98d51bef4b10504) - fix: taxonomy indexing now collects slugs from all categories instead of only the last one, and pg backup uses pg_dump instead of pg_dumpall to avoid superuser permission errors

## 1.14.2

### Patch Changes

- [`155f7c8`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/155f7c866d0f94551c46e003459a8f45107bf520) - fix: exclude .env from Docker build context, delegate keycloak account URL to server, add admin button for privileged users

## 1.13.1

### Patch Changes

- [`60e3f9d`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/60e3f9d29fc445480310300fd396f154d616815e) Thanks [@github-actions[bot]](https://github.com/github-actions%5Bbot%5D)! - fix: exclude .env files from Docker build context and fix cal-embed type cast

## 1.13.0

### Minor Changes

- [#83](https://github.com/Zetesis-Labs/ZetesisPortal/pull/83) [`5e634c1`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/5e634c184760ca32ae4369e9bb3da02aecffcb61) Thanks [@Fiser12](https://github.com/Fiser12)! - Add API token authentication for MCP search proxy. Users can create and manage Bearer tokens from the settings page to connect external MCP clients (Claude Desktop, Cursor) to the search service. Includes subscription check, token hashing, and SSE streaming support.

## 1.12.0

### Minor Changes

- [`17a4fbb`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/17a4fbb01a653af33dee6274d9b4d6c50715703f) - argocd configured and changed a secret handling

## 1.11.2

### Patch Changes

- [#78](https://github.com/Zetesis-Labs/ZetesisPortal/pull/78) [`e2e1ba2`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/e2e1ba2054d1dcbe21ec7e92e57dce61fe4059d9) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: enable MCP docker workflow trigger and align all package versions

## 1.11.1

### Patch Changes

- [#76](https://github.com/Zetesis-Labs/ZetesisPortal/pull/76) [`dc3901e`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/dc3901ecf415ed795828bb71cb240f2799d033d6) Thanks [@Fiser12](https://github.com/Fiser12)! - Fix MCP docker workflow trigger and stop tracking next-env.d.ts

## 1.10.0

### Minor Changes

- [#54](https://github.com/Zetesis-Labs/ZetesisPortal/pull/54) [`ad438f9`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/ad438f9985f7784a74c26753cb172e55f1529e18) Thanks [@Fiser12](https://github.com/Fiser12)! - Refactored TypeScript types across all packages: eliminated all `as any` casts, removed unnecessary generics (`TConfig extends Config`, `TSlug extends CollectionSlug`), centralized duplicate interfaces, and introduced discriminated unions for better type narrowing. Added architecture documentation for cast patterns, type audit methodology, npm publishability, and AI-assisted developer experience.

## 1.9.9

### Patch Changes

- [`ea4e5ac`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/ea4e5ac131a283f409cb381258b5c9a9d02158d4) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: typing issues in the payload-lexical-blocks-builder

- [`ea4e5ac`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/ea4e5ac131a283f409cb381258b5c9a9d02158d4) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: typing issues in the payload-stripe-inventory

## 1.9.8

### Patch Changes

- [`9ad7055`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/9ad705518ef077629e0fd579f75fc4b38bc6583f) Thanks [@Fiser12](https://github.com/Fiser12)! - chore: trigger new version

## 1.9.7

### Patch Changes

- [`b0d58ac`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/b0d58ac0f3ac086f2f65263322ee037649b8e3ec) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: issue autodeploying new version of mcp

- [`b0d58ac`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/b0d58ac0f3ac086f2f65263322ee037649b8e3ec) Thanks [@Fiser12](https://github.com/Fiser12)! - added mcp server to request stuffs to typesense

## 1.9.6

### Patch Changes

- [`ee155bc`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/ee155bca67bd84b787a97265f587b06acad16694) Thanks [@Fiser12](https://github.com/Fiser12)! - fix again issues auto-deploying docker

## 1.9.5

### Patch Changes

- [`a14bb8a`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/a14bb8a47681f78560f9d64d910e2024f72e8fb7) Thanks [@Fiser12](https://github.com/Fiser12)! - fix: issue deploying docker

## 1.9.4

### Patch Changes

- [`decfb88`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/decfb884b2bbf6e9fd49c410abe3b8623c0a758c) Thanks [@Fiser12](https://github.com/Fiser12)! - fix issue at autodeploy of docker image

## 1.9.3

### Patch Changes

- [`552ff89`](https://github.com/Zetesis-Labs/ZetesisPortal/commit/552ff892609989984e8a22e4a1b69bcc9c241b4a) Thanks [@Fiser12](https://github.com/Fiser12)! - Updated deploy workflow

## 1.9.2

### Patch Changes

- 2106b0e: Fixed issue recovering chunks at react agent

## 1.9.1

### Patch Changes

- c553a9a: Updated to turbopack

## 1.9.0

### Minor Changes

- d1f6374: Updated to nextjs 16 and payload cms 3.75.0

## 1.8.0

### Minor Changes

- We added more functions to allow the package to become more customizable chat agents in payloadcms

## 1.7.4

### Patch Changes

- 9e77c00: fix: issues in chat-agent styling

## 1.7.3

### Patch Changes

- 668266a: Fixed issue with css

## 1.7.2

### Patch Changes

- 8ff3d8c: fixed problem in dependencies of chat-agent with @assistant-ui/react

## 1.7.1

### Patch Changes

- 40d664a: Fixed error with lucide react, package didn't load

## 1.7.0

### Minor Changes

- cf47f0f: First version with a chat-agent working

## 1.6.20

### Patch Changes

- 07a8604: Fixed problems with tailwind finally

## 1.6.19

### Patch Changes

- 9ec10fa: Fix tailwind in th chat-agent

## 1.6.18

### Patch Changes

- 819a292: Fixed issue in chat-agent

## 1.6.17

### Patch Changes

- d628208: added chat agent package to the colection of packages

## 1.6.16

### Patch Changes

- cc721cb: added the sumarization by ai to the payload-indexer

## 1.6.15

### Patch Changes

- 954f5ce: fix issue related with payload-taxonomies package

## 1.6.14

### Patch Changes

- 41dee94: Updated payload-taxonomies for simplify all

## 1.6.13

### Patch Changes

- 6acd2d9: Updated payload-stripe-inventory to improve how the package is configured

## 1.6.12

### Patch Changes

- 2c43730: Uploaded payload-stripe-inventory to new system of building

## 1.6.11

### Patch Changes

- 90d208b: payload updated to 3.72.0

## 1.6.10

### Patch Changes

- 59dcf78: Fixed issue in the external tsdown config

## 1.6.9

### Patch Changes

- 772a66e: Fix publishConfig exports to point to correct .mjs and .d.mts files instead of non-existent .js and .d.ts files

## 1.6.8

### Patch Changes

- 773fc91: Unified in the repository all the common packages

## 1.6.7

### Patch Changes

- 7288412: Updated the external depencencies to avoid conflits with paylaod types

## 1.6.6

### Patch Changes

- 4619358: update typos in payload-typesense and payload-indexer

## 1.6.5

### Patch Changes

- ad762ff: feat: generic typing in the config type

## 1.6.4

### Patch Changes

- 082043e: fix: issues related with the compilation and import of the package

## 1.6.3

### Patch Changes

- b306f4d: Update to payload 3.70.0

## 1.6.2

### Patch Changes

- b075910: Initial release of packages migrated from Escohotado-Portal
