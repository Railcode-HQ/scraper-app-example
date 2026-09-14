# Scraper app example

A [Railcode](https://github.com/Railcode-HQ/railcode-examples) example for exploring
companies and finding the third-party vendors they list as subprocessors. Browse
the Y Combinator directory or add company websites, run an extraction with Exa,
and explore the results by company or vendor.

## Features

- Search and filter YC companies by batch, industry, location, tags, and team size.
- Add companies from website URLs, with descriptions extracted through Exa.
- Organize companies into bookmark lists and add notes to custom companies.
- Extract published subprocessors with source citations and reported API costs.
- Filter results, explore vendor usage across companies, and export CSV files.
- Optionally query the dataset through the included `stack` agent.

## Requirements

- Node.js 22.12 or later and npm.
- The Railcode CLI and access to a Railcode organization where you can deploy apps.
- An Exa API key configured as an organization service connector for extraction.

The app uses a React frontend and a Hono backend worker. Railcode provides the
runtime, storage, user identity, and connector proxy. Run both through the
Railcode CLI; the Vite server alone cannot serve the backend routes.

## Getting started

### 1. Install and sign in

```sh
git clone https://github.com/Railcode-HQ/scraper-app-example.git
cd scraper-app-example
npm ci
npm install -g railcode
railcode login
```

Sign in to the organization where you want to run the app. For a custom Railcode
instance, use `railcode login --api-url <your-api-url>`.

### 2. Choose an app name

The app slug in [railcode.json](railcode.json) defaults to `scrape`. Keep it if
that name is available in your organization, or change it before deploying.
Use a new slug if you already have an unrelated app named `scrape`.

### 3. Configure Exa

Have an organization administrator configure an Exa service connector with:

| Setting | Value |
| --- | --- |
| Connector name | `exa` |
| Base URL | `https://api.exa.ai` |
| Authentication | Your Exa API key in the `x-api-key` header |
| Request content type | `application/json` |
| Allowed operation | `POST /answer` |

The worker calls Exa's [Answer API](https://exa.ai/docs/reference/answer) with a
JSON output schema. [manifest.yaml](manifest.yaml) declares the connector
permission; the credential belongs in Railcode's connector configuration.

YC browsing does not use Exa. Adding custom companies and running subprocessor
extractions do. These operations make paid API calls, including during local
development when the connector is available. The UI's estimates are defined in
code; actual reported costs come from Exa responses.

### 4. Run locally

```sh
npm run dev
```

Open the URL printed by Railcode. Search for a company in the YC source, save it
to a list, then try an extraction with a small selection after configuring Exa.

### 5. Deploy

```sh
railcode deploy
```

The Railcode CLI builds and deploys the frontend and worker together. Configure
app access for the people who should use it. Lists, custom companies, runs, and
results share the app's storage; the worker does not partition them by user or
restrict edits to their creator.

## How it works

The frontend calls same-origin `/api/*` routes. The worker queries YC's public
Algolia index for directory searches and uses the `exa` connector to extract
company information. Results, run progress, bookmarks, and a vendor lookup index
are stored through `@railcode/sdk`.

Runs process small batches, with the browser requesting each step. Keep the app
open while a run is progressing. Completed batches are saved, so a run can be
continued after returning to the app; it is not an unattended background job.

| Path | Purpose |
| --- | --- |
| [frontend/src/](frontend/src/) | React views, filters, lists, and CSV export |
| [server/index.ts](server/index.ts) | Hono API routes |
| [server/yc.ts](server/yc.ts) | YC search, public credentials, and company lookup |
| [server/custom.ts](server/custom.ts) | Company URLs, descriptions, and notes |
| [server/exa.ts](server/exa.ts) | Exa connector calls and response parsing |
| [server/workflows.ts](server/workflows.ts) | Extraction prompts and schemas |
| [server/runs.ts](server/runs.ts) | Batch progress and stored results |
| [server/lookup.ts](server/lookup.ts) | Vendor lookup index for the agent |
| [manifest.yaml](manifest.yaml) | Connector and outbound network permissions |

To add an extraction workflow, implement the `Workflow` interface and register it
in `WORKFLOWS` in `server/workflows.ts`. If you add direct network calls, keep
`manifest.yaml` and the allowlist in `server/net.ts` in sync.

## Optional dataset agent

[agents/stack/agent.yaml](agents/stack/agent.yaml) defines a read-only Railcode
agent that answers questions such as “Which companies name Retool?” using the
stored subprocessor dataset and vendor index.

Set up this agent separately in your Railcode organization. If you renamed the
app, update `tools.app_data` and the app references in its instructions. The
manifest selects `gpt-5.6-terra`; choose an available model if your organization
uses a different configuration. Slack use also requires a Railcode Slack
integration. The web app works independently of this agent.

## Data and limitations

- A new deployment has its own storage. This repository includes no company
  results, bookmarks, run history, or exported datasets.
- YC access uses public search credentials read from its companies page, with a
  public fallback in `server/yc.ts`. No personal Algolia key is needed. Changes
  to YC's page or index can require updating this integration.
- The YC source caps retrieval at 1,000 companies per query. Narrow filters to
  work with smaller subsets.
- Extracted results reflect the public pages Exa finds. Review citations when
  accuracy matters. An empty result does not establish that a company uses no
  third-party vendors.
- The frontend loads fonts from Google Fonts and proxies supported YC logos
  through the worker.

## Local configuration

Credentials and machine-specific state stay outside Git. The ignore rules cover
`.dev.vars`, `.env*`, `.railcode`, personal agent/editor settings, `node_modules/`,
and `dist/`. Example environment files may be tracked, but must contain only
placeholders. Use your own Railcode login and connector credentials.

## License

[MIT](LICENSE) — Copyright (c) 2026 Railcode HQ.
