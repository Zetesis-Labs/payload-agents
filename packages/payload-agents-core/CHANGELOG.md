# @zetesis/payload-agents-core

## 0.2.1

### Patch Changes

- [#12](https://github.com/Zetesis-Labs/PayloadAgents/pull/12) [`b622d37`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b622d37f7ecc738a1342d5942e553697b64c8c67) Thanks [@Fiser12](https://github.com/Fiser12)! - Add X-Internal-Secret authentication to all runtime requests. Previously only the reload endpoint was authenticated; now all proxy calls (chat, sessions) include the header and the Python runtime rejects unauthenticated requests.

- [#11](https://github.com/Zetesis-Labs/PayloadAgents/pull/11) [`a64978b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/a64978bc45113f8363d68c820a7d247e46b51380) Thanks [@Fiser12](https://github.com/Fiser12)! - Validate session ID ownership on all chat endpoints. Prevents cross-tenant session access and session hijacking via user-controlled chatId.

- [#13](https://github.com/Zetesis-Labs/PayloadAgents/pull/13) [`1efcdb9`](https://github.com/Zetesis-Labs/PayloadAgents/commit/1efcdb9756b7350f4b2ae5a05961318f3e1d0b4e) Thanks [@Fiser12](https://github.com/Fiser12)! - Cap the `limit` query parameter on the sessions list endpoint to a maximum of 100, preventing unbounded upstream queries.

- [#15](https://github.com/Zetesis-Labs/PayloadAgents/pull/15) [`de24471`](https://github.com/Zetesis-Labs/PayloadAgents/commit/de24471d1826075e17a2e4a8011d67a5e1268a84) Thanks [@Fiser12](https://github.com/Fiser12)! - Warn on empty runtimeSecret at plugin init. Use conservative token estimate (message/3 + 2000 overhead) instead of message/4.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system
