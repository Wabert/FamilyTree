# Family Reunion

A web app where everyone in a family adds themselves to a shared tree and sees how
they are related to everyone else.

## Running it

```bash
npm run dev
```

Then open http://localhost:3000. Other commands: `npm test` (relationship and layout
tests), `npm run lint`, `npm run build`.

## How it works

- **Only two links are stored**: parent → child, and spouse. Cousins, in-laws,
  "second cousin once removed" and the rest are calculated in
  `src/lib/relationship.ts` by finding the closest shared ancestor.
- **People are not accounts.** A person is a card in the tree; a viewer claims one
  with "This is me". Ancestors and children are in the tree without ever logging in.
- **The tree is drawn by** `src/lib/layout.ts`: oldest generation on top, couples
  side by side, children in a row underneath.

## Where things are

| Path | What it holds |
| --- | --- |
| `src/lib/types.ts` | The data model |
| `src/lib/relationship.ts` | "How am I related to…" calculator |
| `src/lib/layout.ts` | Positions cards and connecting lines |
| `src/lib/store.ts` | All reads and writes of family data |
| `src/lib/sample-family.ts` | The made-up Hartley family shown on first load |
| `src/components/` | The screens: tree, person panel, add/edit form |
| `supabase/schema.sql` | Database tables, access rules and photo storage for shared mode |

## Two modes

- **Demo mode** (no `.env.local`): opens straight to a sample family and saves to the
  browser's localStorage. Each device has its own copy.
- **Shared mode** (Supabase configured): people sign in, the tree is stored in
  Supabase, and everyone who joins sees the same tree, updating live.

## Connecting Supabase

1. Create a project at https://supabase.com (the free plan is enough).
2. In the dashboard open **SQL Editor**, paste in all of `supabase/schema.sql`, and run it.
   Then do the same with `supabase/update-3-moderators.sql` and
   `supabase/update-4-photo-gallery.sql`, in that order. An existing project only
   needs the update files it hasn't had yet.
3. Under **Authentication → Sign In / Providers**, turn on **anonymous sign-ins**.
   This is what lets relatives join from the invite link without an email.
4. Copy `.env.example` to `.env.local` and fill in the project URL and publishable
   key (dashboard → **Connect**).
5. Restart `npm run dev`.

How people get in:

- **Organizer:** signs in by email, creates the family tree, then uses **Invite** to
  get a link and QR code.
- **Everyone else:** opens the link and taps **Join the family tree**. No account
  needed; they stay signed in on that device. Anyone with the link can join and edit,
  so share it only with family.

Things to know before a real reunion:

- Supabase's built-in email only delivers to the project's own team members and
  sends about 2 emails an hour. Email sign-in for the whole family needs a custom
  SMTP provider set up under Authentication.
- Joining without an email is limited to 30 sign-ups an hour per network by
  default. A reunion on one Wi-Fi network shares that limit; raise it under
  **Authentication → Rate Limits**.
- When the app is put online, add its address under **Authentication → URL
  Configuration** so sign-in emails link to the right place.

## Putting changes online

The app is hosted on Vercel at https://family-reunion-eight.vercel.app (project
`family-reunion`). After changing the code, publish it with:

```bash
vercel deploy --prod
```

The Supabase URL and publishable key are saved in the Vercel project's
environment variables, so they don't need to be supplied again.

## Shared-mode code

| Path | What it holds |
| --- | --- |
| `src/lib/supabase.ts` | Creates the Supabase client from `.env.local` |
| `src/lib/session.ts` | Who is signed in, invites, which tree is open |
| `src/lib/remote.ts` | Every database and photo-storage call |
| `src/components/SignIn.tsx`, `FamilyPicker.tsx`, `InviteDialog.tsx` | Sign-in, tree list, invite link and QR code |
