# Fleet server config helper

A single static page that turns a few answers into a Fleet server config: `fleet.yml`, environment
variables or command-line flags. There is no server behind it. The page's Content Security Policy
(`default-src 'none'; connect-src 'none'`) makes the browser block every outgoing request, so
nothing you type leaves the tab.

It walks through a short wizard (database and Redis, server, optional settings, secrets), shows the
result live, lists what differs from Fleet's defaults, and gives copy-paste commands for macOS,
Linux and Windows. An existing `fleet.yml` can be pasted in and edited. Secrets stay out of the
output unless you opt in.

Modeled on [the Hetzner config helper](https://grayw.github.io/hetzner-fleet-opentofu/).

## Layout

```
web/
  index.html              the page: CSS, UI code and two build markers
  src/*.mjs               pure logic (builder, YAML encoder, importer, share links, ...)
  data/schema.json        every field: key, type, default, label, help (source of truth)
  data/schema-ignore.json Fleet options deliberately left out, with reasons
  scripts/build.mjs       inlines src/ and the schema into web/dist/index.html
  scripts/check-schema.mjs  compares schema.json with Fleet's config.go
  test/                   node --test, no dependencies
resources/                reference copies of Fleet's config.go and docs
```

## Working on it

Needs Node 22 or newer and nothing else.

```bash
node --test web/test/*.test.mjs   # unit tests, including parity with the original Elixir output
node web/scripts/build.mjs        # writes web/dist/index.html
node web/scripts/check-schema.mjs # compares the schema with Fleet's latest release
```

Open `web/dist/index.html` in a browser, or serve it: `python3 -m http.server -d web/dist 4173`.

## Keeping the schema current

The weekly workflow runs `check-schema.mjs` against Fleet's latest release. If Fleet adds or removes
an option in a section the helper covers, the run fails before deploying, so the last good site
stays live. Add the field to `web/data/schema.json` (labels and help text are hand-written), or to
`web/data/schema-ignore.json` with a reason, and push. Refresh `resources/config.go` from the same
release so the offline test keeps agreeing.

## History

This started as a Phoenix LiveView app (commit `367264d`). `web/test/golden/generate.exs` produced
`schema.json` and the golden fixtures from that implementation, and the JavaScript port matches its
output byte for byte.
