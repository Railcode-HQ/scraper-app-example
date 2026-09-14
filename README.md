# Scrape

A Railcode app for browsing Y Combinator companies, maintaining company lists,
and extracting company subprocessors through Exa.

## Requirements

- Node.js, npm, and the Railcode CLI.
- Your own Railcode environment. The backend uses Railcode storage, identity,
  and connectors; this is not a standalone Vite or Node server.
- An Exa service connector named `exa`, permitting `POST /answer`, for extraction
  workflows and adding custom companies. See `manifest.yaml`.

Install dependencies with `npm ci`. Configure Railcode for your own environment
before running `npm run dev` or deploying. `railcode.json` uses the app name
`scrape`; change it if necessary.

YC browsing reads public Algolia credentials from YC's companies page, with a
public fallback in `server/yc.ts`. It needs no personal Algolia key, but depends
on YC's public endpoints remaining compatible. Network permissions are declared
in `manifest.yaml`.

The optional agent in `agents/stack/agent.yaml` requires separate setup. It
references app `scrape` and model `gpt-5.6-terra`; adapt these to your environment.
Using it from Slack also requires your own Railcode Slack integration.

## Sharing

Share a Git clone or Git archive, rather than a copy of the working directory.
Local credentials (`.dev.vars`, `.env*`), Railcode deployment metadata
(`.railcode`), personal tooling settings, dependencies, and build output are
ignored. Keep these files local and use your own credentials.

Stored collections, runs, custom companies, and bookmarks are not included in
the source repository. A new app starts with its own storage.
