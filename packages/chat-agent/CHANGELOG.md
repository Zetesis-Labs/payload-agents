# @zetesis/chat-agent

## 0.2.1

### Patch Changes

- [#17](https://github.com/Zetesis-Labs/PayloadAgents/pull/17) [`3c372ab`](https://github.com/Zetesis-Labs/PayloadAgents/commit/3c372abcc79f62c1133e7563feda381aa0724b3d) Thanks [@Fiser12](https://github.com/Fiser12)! - Emit shadcn utilities in `dist/styles.css` by adding `@theme inline` to `src/styles/input.css`. Tailwind v4 needs the `--color-*` tokens mapped to the host's CSS variables at package build time; without this block the bundled stylesheet was missing `bg-background`, `border-border`, `text-foreground`, etc., so chat widgets rendered transparent in host apps that didn't regenerate those utilities from their own source.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system

## 0.1.3

### Patch Changes

- [`c73a899`](https://github.com/Zetesis-Labs/PayloadAgents/commit/c73a89959dba50c31f5563bf21978952f7a8e3ce) - fix: issue regarding jsx tsdown build compilation

## 0.1.1

### Patch Changes

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - updated payload to 3.79.1

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - added requireTaxonomies to payload-typesense

- [#3](https://github.com/Zetesis-Labs/PayloadAgents/pull/3) [`ee6bd3e`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ee6bd3ef11784d315ed65640a144216ef8fd1f5c) Thanks [@Fiser12](https://github.com/Fiser12)! - changed react dependencies to 19^

## 0.1.0

### Patch Changes

- Initial release under @zetesis scope
