# MoneyPilot Web Deployment

MoneyPilot Web is a static PWA. It must be served from HTTPS for iPhone Safari installation and service-worker offline caching.

## What This Solves

- No 7-day signing expiry: this is not a sideloaded iOS app and does not use a temporary developer certificate.
- No Mac server dependency: deploy the static files to HTTPS, then iPhone opens the public URL.
- Local iPhone data: ledger data is stored in the browser on the device. It is not sent to a server by this app.
- Offline use: after the first successful online load, the service worker caches the app shell so the home-screen app can launch offline.
- Recoverable local ledger: the app can export and restore a full JSON backup containing transactions, categories, learned rules, and settings.
- Durable local storage: the app keeps a fast `localStorage` boot cache and mirrors the full ledger into IndexedDB on the same iPhone.
- Long-term updates: the installed PWA exposes `More > Local install > Check update` so users can pull the latest cached app shell after a deploy.

## Recommended Hosting

Use one of these static hosts:

- Cloudflare Pages
- Netlify
- Vercel
- GitHub Pages

For Netlify, this repo already includes `netlify.toml`.

For Vercel, this repo already includes `vercel.json`.

For GitHub Pages, this repo already includes `.github/workflows/pages.yml` and `.nojekyll`.

## Preflight

Run:

```bash
npm run icons
npm run check:pwa
```

After the host gives you an HTTPS URL, verify the live site:

```bash
npm run check:deploy-url -- https://<your-hosted-url>/
```

This confirms the deployed iPhone PWA URL, manifest, icons, service worker fallback, and service-worker cache headers.

## Deploy Settings

Use these settings on the hosting provider:

- Project root: `money-pilot-web`
- Build command: `npm run icons && npm run check:pwa`
- Output directory: `.`
- Framework preset: static site / other

## GitHub Pages

1. Put this folder in a GitHub repository.
2. Push to the `main` branch.
3. In GitHub, open `Settings > Pages`.
4. Set source to `GitHub Actions`.
5. The included `Deploy MoneyPilot Web` workflow publishes the static PWA.

The final URL usually looks like:

```text
https://<username>.github.io/<repo>/
```

## Install On iPhone

1. Open the deployed HTTPS URL in Safari.
2. Wait for the page to finish loading once.
3. Tap the Safari share button.
4. Choose `Add to Home Screen`.
5. Launch MoneyPilot from the home-screen icon.

After this, the app shell can open offline. Ledger data remains on the iPhone in browser storage, with IndexedDB used for the durable local ledger, unless the user clears Safari website data, removes the home-screen app data, or restores the device.

## Local Backup On iPhone

Open `More > Export full backup` in the installed app and save the JSON file to the iPhone Files app. Use `More > Restore full backup` to recover the complete local ledger later.

## Updating The App

Edit files, bump `APP_VERSION` in `service-worker.js`, then deploy again.

The next online launch updates the cached app shell.

The `APP_VERSION` constant in `src/app.js` must match `service-worker.js`; `npm run check:pwa` enforces this before deployment.
