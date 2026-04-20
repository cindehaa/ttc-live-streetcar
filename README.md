# ttc-live-streetcar

Next.js app for the **TTC Streetcar Tracker** (live vehicle positions via the public UmoIQ feed).  
Repository: [github.com/cindehaa/ttc-live-streetcar](https://github.com/cindehaa/ttc-live-streetcar).

## Run locally

```bash
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` if you need to override the public site URL for metadata:

- `NEXT_PUBLIC_SITE_URL` — canonical origin (default in code: `https://ttc-live.cindehaa.com`)

## Deploy

Connect the repo to Vercel (or your host), set the custom domain `ttc-live.cindehaa.com`, and deploy. Ensure DNS points to the provider.
