# Chronicle VTT — v0.2

**Private 5e-compatible homebrew tabletop platform.** Intended for an original campaign with optional Whoniverse homebrew. Rules content is campaign-scoped and separate from the engine.

## Working features

### v0.1 foundations (preserved)
- Email/password signup, sign-in, sign-out using Supabase Auth.
- DM creates a campaign, receives a private invitation code; players join via code.
- Campaign membership and role-aware UI with database RLS.
- Simple character creation, ownership, HP, level, notes and roster.

### v0.2 homebrew engine
- DM-only editor for **species**, **classes**, **backgrounds** and **features**.
- Draft/private versus published/player-visible rule entries.
- Species: creature type, size, movement speed, languages and narrative description.
- Classes: hit die, primary abilities, proficiencies, equipment, and level-based feature grants.
- Backgrounds: proficiencies, equipment, and feature grants.
- Features: description, activation, uses, recharge, prerequisites and structured numeric modifiers.
- Linked features unlocked by character level; publish linked features as well to expose them to players.
- Character builder offers published campaign definitions, automatically associates selected rule IDs, and previews unlocked traits/stat bonuses.
- Existing v0.1 free-text species/classes are preserved and remain editable.
- Server-side guards enforce campaign boundaries, published selections and appropriate linking; DMs edit rules and players only read published rules.

**Intentional limits:** The v0.2 derived bonuses are previews, not yet automatic combat/HP or ability-score updates. The full 5e ability and dice engine remains for v0.3, maps v0.4, encounters v0.5, Whoniverse temporal/regeneration mechanics v0.6.

## Tech stack

- Vite + React 19 + TypeScript, Supabase Auth/PostgreSQL, browser-based UI.
- The static site is deployed from `ONSoftware-Websites/CVTT` to Vercel (`https://cvtt.onsoftware.uk`).
- Browser variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (no secret/service-role key).

## Setup

1. Node.js 22.12+; `npm install`; use `npm run build` or `npm run dev`.
2. Use a **dedicated** Supabase project; do not modify unrelated business projects.
3. Apply migrations **in order**, once, to a fresh project:
   - `supabase/migrations/20261114000100_foundations.sql`
   - `supabase/migrations/20261114000200_fix_campaign_owner_visibility.sql`
   - `supabase/migrations/20261114000300_homebrew_engine.sql`
4. **Your existing CVTT Supabase project has already received the v0.2 migration. Do not rerun it.** For any other v0.1 installation, apply only `20261114000300_homebrew_engine.sql` once.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel; the new schema adds no environment variables.
6. Keep schema `private` unexposed in the Data API. Keep Supabase Auth email verification enabled for production.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full production checklist and security expectations.

## v0.2 acceptance tests

1. Sign in as the DM, open a campaign, navigate to **Homebrew Library**.
2. Create a **Feature** (e.g. `Binary Vascular System`) with rules description; save as **Published**.
3. Create a **Species** (e.g. `Gallifreyan`), configure type, speed, languages; link the Feature at level 1 and **Publish** the species.
4. Create a **Class** with Hit Die and an ability at level 3. Create a **Background** with proficiencies.
5. Create a character and choose published species, class and background. Confirm level 1 features show, level 3 class features stay locked until level 3.
6. Refresh the page and ensure the selected rule IDs and details persist.
7. Sign in as a player: confirm published entries are visible, drafts and editing controls aren't available, and published options appear in character creation.
8. Confirm players cannot modify or remove other users' characters or custom rule entries.
9. Confirm you can still edit a v0.1 character which has no linked rule IDs, using the manual/free-text option.

## Security and licensing

RLS is enabled on all public tables. The server verifies that linked features and selected character options belong to the same campaign and have appropriate kinds. SQL migrations avoid replacing character data. Homebrew content remains private to campaigns unless the DM publishes it to that campaign's players.

No proprietary Doctor Who assets or non-SRD D&D rulebook text are bundled. Only publish original or appropriately licensed content.