# Apna Flight

Travel ERP + CRM for Indian travel agencies: leads and follow-ups, flight invoices with GST,
receipts, double-entry accounts and ledger statements. Built with Next.js and Supabase.

**Milestone 1 (this version):** sign up → set up company → add clients/suppliers/bank → capture a
lead with follow-ups → invoice it (domestic or international flight, CGST+SGST or IGST worked out
from place of supply, sale + purchase + margin per passenger) → print → record the receipt and
adjust it against the invoice → see it all in the ledger statement and dashboard.

## Run it locally

Requires Node.js 22+ (see `.nvmrc`).

1. **Create a Supabase project** at [supabase.com](https://supabase.com) — choose the Mumbai
   (`ap-south-1`) region.
2. **Create the database.** Either link the CLI and push the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   or open the project's **SQL Editor** and run the three files in `supabase/migrations/` in order.
3. **Auth settings** (Supabase → Authentication → URL Configuration): set Site URL to
   `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs.
   (Add your production URL too when you deploy.)
4. **Keys.** Copy `.env.example` to `.env.local` and fill in the project URL and publishable key
   from Supabase → Project Settings → API. `.env.local` is git-ignored — never commit keys.
5. Start it:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000, create an account and set up your company.

## Checks

```bash
npm run test:db     # applies every migration to in-memory Postgres and tests posting, GST, RLS
npm run typecheck
npm run lint
npm run build
```

## Layout

```
app/(auth)          login, signup
app/onboarding      first-run company setup
app/(app)           dashboard, crm/leads, billing/invoices, vouchers/receipts,
                    accounts/ledger, masters/ledgers, settings/company
lib/                supabase clients, context (company + financial year), gst, money, words
supabase/migrations schema + RLS, app RPCs, reference data (states with GST codes, airlines, cities)
tests/db.test.mjs   database test suite
replica/            recon map, feature checklist, architecture and build plan
```
