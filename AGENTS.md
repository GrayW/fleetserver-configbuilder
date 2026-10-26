This is a static, no-network web page (plain HTML, CSS and JavaScript) that generates Fleet server
config. There is no framework, bundler or runtime dependency; Node 22 is only used for tests and
the build.

## Project guidelines

- Run `node --test web/test/*.test.mjs` and `node web/scripts/build.mjs` when you finish a change, and fix anything failing.
- The page must never make a network request. Keep the Content Security Policy in `web/index.html` (`default-src 'none'; connect-src 'none'`), and never add external scripts, fonts, images or analytics.
- Logic that can be tested without a DOM goes in `web/src/*.mjs` as plain top-level `const`/`function` declarations with `export`. `web/scripts/build.mjs` inlines these into one script scope, so names must be unique across modules (the build fails on a clash) and `export default`, `export { }` and multi-line imports are not supported.
- `web/data/schema.json` is the source of truth for fields. Field names follow Fleet's `config.go` struct tags, not the prose docs. Run `node web/scripts/check-schema.mjs` after changing it. Fields Fleet has but the helper intentionally omits go in `web/data/schema-ignore.json` with a reason.
- Password-type fields are secrets: never put them in share links, summaries, imports or the URL, and keep them out of output unless the user opts in.
- Don't add npm dependencies. Use Node's built-in `node:test` and `fetch`.
- Write UI copy in plain language, as on the Hetzner helper this is modeled on.
