# CVTT — Supabase and Vercel setup

Repository: `ONSoftware-Websites/CVTT` (private)
Planned production address: `https://cvtt.onsoftware.uk`

This repository contains the **Chronicle VTT v0.2 frontend and database migrations**. A working production site requires a separate Supabase project and environment variables; the code alone is not a live deployment.

## 1. Configure the dedicated Supabase project

1. Open the dedicated Supabase project (the connection labelled **DnD Database**, if that is the project you intend to use). Confirm its actual project reference in the Supabase dashboard. Do **not** run this migration against an existing business database.
2. Use the SQL Editor to execute `supabase/migrations/20261114000100_foundations.sql` **once**. Alternatively, apply it using a managed Supabase migrations workflow. The v0.1 script creates tables, RLS policies, triggers and a `join_campaign` RPC; it is not designed to be run repeatedly. For an existing v0.1 installation, run **only** `supabase/migrations/20261114000300_homebrew_engine.sql` to add v0.2 tables, protections and optional character references.
3. Under **Authentication → Providers**, enable email/password sign-in. Keep email confirmation enabled for production.
4. Under **Authentication → URL Configuration**, configure the Site URL to `https://cvtt.onsoftware.uk` and add it to Redirect URLs. During local testing, also permit `http://localhost:5173/**`.
5. Under **Project Settings → API / Connect**, copy the **Project URL** and **publishable key**. This project must not expose a `service_role` key or other secret in browser code.
6. Keep the `private` database schema **out** of the Supabase Data API's exposed schemas.

## 2. Deploy on Vercel

1. Create a new Vercel project by importing the private GitHub repository `ONSoftware-Websites/CVTT`. Grant Vercel access to the repo if prompted.
2. Framework preset: **Vite**. Root directory: repository root (`./`).
3. Build command: `npm run build`. Output directory: `dist`. Install command: `npm install` (or Vercel's default).
4. In **Environment Variables**, set:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's **publishable** key |

5. Deploy to obtain the initial `*.vercel.app` URL. Check the site and Supabase Auth behaviour. In Supabase, add the Vercel preview/production callback addresses to allowed redirects as needed.
6. Under Vercel **Domains**, add `cvtt.onsoftware.uk`. Follow Vercel's exact DNS instructions at your DNS host. Ordinarily this means a CNAME for `cvtt`, but **use the record and verification targets Vercel supplies**; do not disturb the main ONSoftware domain or its mail records.
7. When HTTPS is working on the custom domain, confirm the Supabase Auth Site URL and allowed redirects are correct for `https://cvtt.onsoftware.uk`.

Vercel's Hobby plan is intended for personal, non-commercial use. Confirm your usage falls within its terms and quotas.

## 3. Verify before inviting players

- Sign up with an email address, confirm it, and sign in.
- Create a campaign as DM and check its private invitation code appears.
- Sign in using a separate player account, join by code, and verify access to the campaign.
- Create a character, change HP and notes, refresh the page and confirm persistence.
- Verify a non-member cannot view a campaign or its characters; verify a player cannot edit someone else's character or read the invitation code.
- Check network/server errors for failed RLS permissions.

v0.2 includes campaign-scoped species/class/background/feature editors. The map engine, dice automation and fully applied ability calculations remain for later releases.

## Security and version control

- `.env.local` and other `.env.*` files (except `.env.example`) are gitignored.
- `VITE_` variables are embedded into the publicly served frontend. Use **only** Supabase's publishable key here; never a database password, secret key or service-role key.
- Run permissions tests against the dedicated project before public release.
- Commit the npm-generated `package-lock.json` after a successful local `npm install`.

## v0.2 database patch

The additive `20261114000300_homebrew_engine.sql` migration creates `homebrew_definitions`, `homebrew_feature_links`, three nullable character reference columns, validation triggers and RLS policies. It does not delete existing characters or campaigns. It must be applied before deploying the v0.2 frontend to avoid missing-table errors.

After applying it, verify the Homebrew Library tab in the app as DM, publish a test species and feature, and check published player access. Do not paste service-role keys into environment variables.
