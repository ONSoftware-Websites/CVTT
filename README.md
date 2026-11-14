# Chronicle VTT — v0.1

An original, 5e-compatible virtual tabletop foundation. Designed for an open Whoniverse campaign, with setting content separated from the core application.

## What works in v0.1

- Supabase email/password registration and sign-in
- A campaign dashboard with create and join flows
- Private, random invite codes visible only to the DM
- Membership and role-aware campaign pages
- Character creation, listing, editing and deletion
- Database-level RLS and an invitation-code join function
- Responsive dark UI

This is the **foundation**, not yet a complete tabletop. The homebrew builder, dice engine, interactive maps, combat automation and regeneration are scheduled for later versions.

Repository: `ONSoftware-Websites/CVTT` · Planned domain: `https://cvtt.onsoftware.uk`

For project-specific Vercel and Supabase setup instructions, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Setup

1. Install Node.js 22.12+ (Vite 8 requires a modern Node.js runtime).
2. Create a **separate Supabase project**. Do not install the schema into an unrelated production project.
3. Open the Supabase SQL editor and run `supabase/migrations/20261114000100_foundations.sql` once, or use the Supabase CLI migrations workflow.
4. In Supabase Auth settings, enable Email authentication and configure the site/redirect URLs. Leave email confirmation enabled for production.
5. Copy `.env.example` to `.env.local` and fill in the new project's URL and **publishable** API key. Never put a service-role/secret key in VITE_ environment variables.
6. Run `npm install` (which generates `package-lock.json`), commit the lockfile, then run `npm run dev` and open the local URL printed by Vite.
7. Run `npm run build` before deployment.

Do not enable the `private` schema in the Supabase Data API exposed schemas setting.

### Hosting

The frontend is a static Vite SPA suitable for Vercel or another static host. If deploying on Vercel, configure the same `VITE_` variables on the project and route SPA paths to `/index.html` (not necessary for this version's single-page app). The Vercel Hobby plan is for personal, non-commercial use only.

### Test checklist

- Create an account and confirm email.
- Create a campaign as DM; verify invite code appears only to the DM.
- Sign in as a second account and join using the invite code.
- Verify the second account cannot modify the campaign's owner or another account's character through database API requests.
- Verify nonmembers cannot read campaign records, rosters or characters.
- Create and edit a character; verify values persist after refresh.

## Proposed development roadmap

- v0.2: content editor for species, classes, backgrounds, features
- v0.3: dice, checks, saving throws, inventories, progression
- v0.4: interactive maps, token permissions and realtime synchronisation
- v0.5: initiative, encounters and basic combat
- v0.6: regeneration, temporal mechanics, technology and Whoniverse content

## Security notes

Campaign invitations contain 80 bits of random UUID-derived entropy. Only authenticated users may join. Membership and ownership permissions are enforced with RLS. The `private` security-definer helpers are deliberately outside exposed API schemas. Production deployment should add rate limiting, audit logging and automated permission tests as the platform expands.

## Licensing/content

Keep Whoniverse-specific content private unless appropriately licensed. Do not copy proprietary rules text or artwork into a publicly distributed platform; rely on permitted SRD material and original homebrew.

### Verification status

The source and SQL files were generated and statically checked. End-to-end application testing and database RLS tests require a dedicated configured Supabase project and successful installation of npm dependencies. Do not treat this release as production tested until the test checklist has passed.
