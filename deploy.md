# Deploying Just Cars (GitHub Pages)

Just Cars is a static site, deployed to **GitHub Pages** by a GitHub Actions workflow on every push to `main`.

- **Live URL:** `https://ervzs.github.io/just-cars/`
- **Workflow:** `.github/workflows/deploy.yml`
- **Cost:** free, with no extra accounts or services.

## One-time setup

1. Open the repo on GitHub: `github.com/Ervzs/just-cars`.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.

That's all. The next push to `main` publishes the site.

## How a deploy works

```
git push origin main
  └─► GitHub Actions "Deploy to GitHub Pages"
        build:  checkout → Node 22 → npm ci → npm run build → copy index.html to 404.html → upload dist/
        deploy: publish the uploaded dist/ to GitHub Pages
```

Follow progress in the repo's **Actions** tab. A green run means the site is live. The deploy job's summary links to the URL.

To redeploy without a code change: **Actions → Deploy to GitHub Pages → Run workflow**.

## Two GitHub Pages specifics the project already handles

**1. The site lives in a sub-folder (`/just-cars/`), not at a domain root.**
`vite.config.ts` sets `base: '/just-cars/'`. Everything derives from it:
- Script, CSS and favicon URLs are prefixed by Vite at build time.
- The router uses `basename: import.meta.env.BASE_URL`.
- Data files are fetched through `dataUrl()` in `src/data.ts`.

If the repo is renamed, change `base` to the new name. If you add a custom domain, change it to `'/'`.

**2. GitHub Pages has no rewrite rules.**
A direct link such as `/just-cars/cars/toyota-hilux-eighth-generation` isn't a real file. The workflow copies `index.html` to `404.html`. GitHub Pages serves `404.html` for any missing path, the app loads, and React Router renders the right page from the URL.

The trade-off: such deep links are answered with HTTP status 404 even though the page renders correctly. Browsers don't care, but search engines may skip those URLs.

## Check before pushing

```sh
npm install
npm run build
npm run preview        # open http://localhost:4173/just-cars/
```

Note the `/just-cars/` in the preview URL: it matches production.

## Check after deploying

- `https://ervzs.github.io/just-cars/`: the grid loads.
- `…/just-cars/?q=hilux`: search works.
- `…/just-cars/cars/toyota-hilux-eighth-generation`: a direct link loads.
- `…/just-cars/cars/does-not-exist`: the app's "We don't have that car" page.
- `…/just-cars/credits`

## Updating the car data

```sh
npm run data       # rebuilds public/data/ (cached responses make reruns fast)
git add public/data && git commit -m "Refresh car data" && git push
```

The push redeploys automatically. If the data summary says Sketchfab was rate limited, rerun `npm run data` an hour later to fill in missing 3D models.

## Rolling back

Revert the bad commit and push (`git revert <sha> && git push`). Alternatively, in **Actions**, re-run the workflow of an earlier good commit.

## Custom domain (optional)

1. **Settings → Pages → Custom domain:** enter the domain, then add the DNS records GitHub shows.
2. Change `base` in `vite.config.ts` to `'/'`, because the site then lives at the domain root.
3. Enable **Enforce HTTPS** once the certificate is issued.
