# MGM MARKET (MG MARKET) — BUY • SELL • DISCOVER

Online marketplace for Ghana (prices in GH₵). Static website + real Supabase backend (Auth, Postgres, Storage, Row Level Security).
Customers can browse, add to cart, and order **without an account**. Only the administrator signs in to the private dashboard.

## What is in this folder
```
index.html            the page (shows a loading screen instantly, never blank)
assets/css/style.css  design (blue + white, mobile first)
assets/js/config.js   <-- YOUR Supabase URL + publishable key go here
assets/js/boot.js     loads the Supabase library, then the app, and shows friendly errors
assets/js/app.js      the whole app (storefront + admin dashboard)
assets/images/        logo + placeholder image
database/schema.sql   everything in one file (same as the 3 migrations)
supabase/migrations/  001_schema, 002_functions, 003_rls_and_storage
tests/run-tests.js    automated browser tests
```

## Step 1 — Connect Supabase (2 minutes)
The project **mgm-market** already exists (ref `jrvgjclapjfjzsgsuoyg`) and the database, security rules and image storage were already applied to it.
1. Open https://supabase.com/dashboard → project **mgm-market** → **Project Settings → API Keys**.
2. Copy the **Publishable key** (starts with `sb_publishable_`; the older `anon` key also works).
3. Open `assets/js/config.js` and replace `PASTE_YOUR_PUBLISHABLE_KEY_HERE`.
4. **Never** paste a `service_role` / secret key into this project.

Starting from a different/new Supabase project instead? Open **SQL Editor**, paste `database/schema.sql`, press **Run**, then put that project's URL + key in `config.js`.

## Step 2 — Create the administrator account (one time)
Your email `mgcowbell@gmail.com` is on a secure allow-list in the database. To become admin:
1. Supabase Dashboard → **Authentication → Users → Add user → Create new user**.
2. Email `mgcowbell@gmail.com`, choose a **new strong password** (don't reuse one shared in chat), tick **Auto Confirm User**, create.
3. Open the website → **Admin Login** → sign in. The **Admin Dashboard** button appears.
Admin rights are granted only by the database (confirmed email on the allow-list) — nobody can make themselves admin from the browser.

Recommended in Supabase → Authentication → URL Configuration: set **Site URL** to your live website address (needed for password-reset and confirmation emails).

## Step 3 — Run it on your computer
Install Node.js (https://nodejs.org, LTS), then in this folder:
```
npm install
npm start
```
Open http://localhost:3000 . (Double-clicking `index.html` also works because the app uses normal scripts, but `npm start` is recommended.)

## Step 4 — Put it online (free, easiest: Netlify)
1. Go to https://app.netlify.com/drop
2. Drag this whole folder (or its ZIP contents) onto the page. You get a live link.
(Vercel / Cloudflare Pages / GitHub Pages also work: no build command, publish directory is the folder root.)
Then add your live link as **Site URL** in Supabase (Step 2).

## Using the admin dashboard
Overview • Products (add/edit/delete/publish, multiple images, private purchase cost) • Orders (filters, details, status + delivery dates, call/WhatsApp/email buttons, CSV export) • Comments & Questions (approve/hide/delete/reply) • Private business info (profit) • Settings (business info, payment instructions, categories, delivery rules).
Fill in **Settings → Business information** (phone, WhatsApp, email, payment instructions). Nothing is invented for you.

## Payments
Only **pay on delivery** and **manual payment** (instructions you write in Settings) are available. No mobile-money/card gateway is connected, and the site never claims otherwise.

## Troubleshooting — blank white page
| What you see | Cause | Fix |
|---|---|---|
| "Store not connected yet" banner | key not set | Step 1 |
| "Supabase library could not be loaded" | offline/CDN blocked | check internet, or run `npm install` (stores the library in `assets/js/vendor/`) |
| "MGM MARKET could not start" | folder re-uploaded without `assets/` | upload the whole folder, keep the structure |
| "Cannot reach the server" + Retry | internet or Supabase paused | press Retry; free projects pause after inactivity — Restore in the dashboard |
| Products missing | none published | Admin → Products → Add Product → status **Published** |
Open the browser console (F12) for technical details; the site itself never shows secrets or stack traces.

## Tests
`npm install && npx playwright install chromium && npm test`
The tests use a **mock** Supabase client (only inside `tests/`) to check rendering, search, cart, checkout flow, errors and mobile layout. They do not test your real project; see `tests/last-results.txt`.
