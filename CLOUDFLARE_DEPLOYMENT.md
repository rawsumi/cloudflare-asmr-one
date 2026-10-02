# Deploying to Cloudflare Workers

This project is fully configured to run on **Cloudflare Workers** with:
- **Global Edge Performance**: 0ms cold starts across 300+ edge data centers.
- **Full-Stack SPA & SSR**: Serves the modern React frontend (`/`) alongside pure server-side rendered HTML for Opera Mini / Symbian OS devices (`/classic`).
- **Streaming Audio Proxy**: Directly forwards HTTP Range requests (`bytes=...`) so streaming audio and download resume work smoothly.
- **REST APIs**: Full search, tracks exploration, and metadata proxying.

---

## Quick Start (Deploy in 2 Minutes)

### 1. Install Wrangler (Cloudflare CLI)
If you don't already have Wrangler installed:
```bash
npm install -g wrangler
```

### 2. Log in to Cloudflare
```bash
npx wrangler login
```

### 3. Deploy
Run the deploy command (builds the React frontend to `dist/` and uploads the worker):
```bash
npm run deploy:cf
```
*(or manually: `npm run build && npx wrangler deploy`)*

Your application will be live at `https://retro-asmr-worker.<your-account>.workers.dev`!

---

## Local Development with Cloudflare Workers

To test your code locally using the Cloudflare Worker runtime:
```bash
npm run dev:cf
```
This starts the local Miniflare / Workerd runtime on `http://localhost:8787`.

---

## Architecture Overview

| Path | Handler | Notes |
| :--- | :--- | :--- |
| `/` | `env.ASSETS` | Modern React SPA (Vite output from `dist/`) |
| `/api/*` | `src/worker.ts` | Upstream proxy, search, tracks, HTTP Range streaming |
| `/classic` | `src/worker.ts` | Server-rendered lightweight HTML for Opera Mini & Symbian OS |
| `/api/download/*` | `src/worker.ts` | Range-supported audio proxy, M3U playlists, TXT batch links, bash scripts |

---

## Configuration Files

- `.github/workflows/deploy.yml`: Automated CI/CD GitHub Actions workflow.
- `wrangler.jsonc`: Modern Wrangler configuration format with asset bindings.
- `wrangler.toml`: Standard TOML configuration for compatibility with CI/CD runners.
- `src/worker.ts`: Hono-powered Cloudflare Worker entry point.

---

## Automated Deployment via GitHub Actions

A pre-configured GitHub Actions workflow is located in `.github/workflows/deploy.yml`. Whenever you push to `main` or `master`, GitHub Actions will build the Vite app and deploy to Cloudflare Workers automatically.

### Setting Up GitHub Repository Secrets:

1. In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions**.
2. Click **New repository secret** and add:
   - `CLOUDFLARE_API_TOKEN`:
     - In the [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens), go to **My Profile** > **API Tokens** > **Create Token**.
     - Choose the template **Edit Cloudflare Workers** (or create custom with Account: *Workers Scripts: Edit*).
   - `CLOUDFLARE_ACCOUNT_ID`:
     - Found on your Cloudflare Dashboard overview page in the right sidebar (labeled **Account ID**).
3. Now, whenever you `git push` to your repository, GitHub Actions automatically deploys the updated worker and static assets!

