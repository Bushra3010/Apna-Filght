# Apna Flight

Travel ERP + CRM for Indian travel agencies: leads and follow-ups, flight invoices with GST,
receipts, double-entry accounts and ledger statements. Built with Next.js and Supabase.

**What's in it (Milestones 1–4):**
- **CRM:** leads with services, pax, source, assignment, status and follow-ups → quotation → proforma → invoice.
- **Holiday packages:** hotels with dated room rates (class, room category, meal plan), activity rates,
  vehicles priced per km, routes, policies, and day-wise itineraries. The quotation builder prices a
  package from these masters with a markup, GST and per-person price, and prints a client proposal
  that hides your costs.
- **Proformas** that don't touch the accounts until converted, and **hotel / cruise vouchers**.
- **Billing:** all 10 invoice types (domestic / international flight, hotel, visa / insurance,
  train / bus, taxi, misc service, bill of supply, tour package, commission). GST on the service
  charge or the full value, CGST+SGST or IGST from place of supply, sale + purchase + margin per line.
  Printable tax invoice / bill of supply with amount in words.
- **Cancellations:** credit notes from an invoice — partial refunds, supplier refunds, your
  cancellation charges with GST (posted to their own income ledger), refund-due tracking.
- **Purchases:** general purchase bills (rent, utilities…) with input GST and TDS.
- **Vouchers:** receipts and payments with bill-wise adjustment, contra, journal.
- **Accounts:** ledger statement, cash book, bank book, day book, trial balance, profit & loss,
  balance sheet, opening balances — all double-entry.
- **Reports:** receivables / payables with ageing, open bills per party, bill adjustment for
  receipts kept on account, sales register with margin, purchase register, CSV export.
- **GST:** GSTR-1 (B2B, B2CL, B2CS, CDNR, CDNUR, nil/exempt, SAC summary) with portal JSON,
  GSTR-2 purchase / ITC listing, GSTR-3B summary.
- **Year-end:** create the next financial year, carry balances forward, close and reopen years.
- **Masters:** ledgers, passengers (passport expiry flags), pick-lists (booked by, meal plans…).
- **Dashboard:** sales, margin, receivable, receipts, monthly sales chart, receivable ageing.

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
   or open the project's **SQL Editor** and run every file in `supabase/migrations/` in name order.
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
npm test            # unit tests (GST maths, GST returns, statements) + database tests
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
