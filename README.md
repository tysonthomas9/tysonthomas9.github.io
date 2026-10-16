# tysonthomas.me

Personal site built with [Astro](https://astro.build), TypeScript, Tailwind CSS v4 and React (for small interactive islands only), in a blueprint visual style.

## Develop

Requires Node 22.12 or newer (`.nvmrc` pins 22.14).

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # astro check + static build into dist/
npm run preview   # serve the built site
```

## Writing posts

Posts are Markdown files in `src/content/blog/`. A post can be a single file (`my-post.md`) or a folder with its images (`my-post/index.md` plus image files). The URL is `/blog/<file or folder name>/`.

```yaml
---
title: Post title
description: One- or two-sentence dek, also used for SEO and social cards.
date: 2026-10-05
tags: [Robotics]
hero: ./hero.png        # optional, relative to the post
heroAlt: Describe the hero image.
draft: false            # drafts show in `npm run dev` only
---
```

Use `<aside class="pull">…</aside>` for a pull quote. Images and tables render wider than the text column.

## Markdown for LLMs

The build also writes plain-Markdown versions of the site, following [llms.txt](https://llmstxt.org):

- `/llms.txt`: an index of the site with links to every post.
- `/llms-full.txt`: every published post in full, in one file.
- A `.md` twin of each page (`/index.md`, `/about.md`, `/blog/<post>.md`), with image links pointing at the published images. Each HTML page links to its twin with `<link rel="alternate" type="text/markdown">`.

These are generated from the same sources as the pages (`src/lib/llm.ts`), so they stay in sync. The About page text lives in `src/content/about.md`.

## Analytics and newsletter

Both are off unless their variable is set at build time. Never commit real values; copy `.env.example` to `.env` for local testing.

| Variable | Purpose |
| --- | --- |
| `PUBLIC_CF_BEACON_TOKEN` | [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/get-started/) beacon token. The beacon is added only to production builds. |
| `PUBLIC_KIT_FORM_ID` | [Kit](https://kit.com) form ID. Shows the email signup form on the home page and at the end of each post. |

For deploys, add them as GitHub Actions repository **variables** (Settings → Secrets and variables → Actions → Variables). The deploy workflow passes them to the build.

## Deploy

`.github/workflows/deploy.yml` builds with the official `withastro/action` and publishes to GitHub Pages. The custom domain is set by `public/CNAME`.
