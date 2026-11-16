# Apna Flight — Architecture

A multi-company travel ERP + CRM for Indian travel agencies: leads → quotations → invoices →
receipts → double-entry books → GST returns. Built fresh from the functional map in
[recon.md](recon.md); the feature checklist is [features.csv](features.csv).

**Stack in one line:** Next.js 16 (App Router, TypeScript) on Vercel + Supabase (Postgres, Auth,
Storage) + Tailwind/shadcn UI + Resend email + Razorpay or Cashfree payment links.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router) + TypeScript | Server components for heavy report pages, server actions for forms; one codebase |
| UI | Tailwind + shadcn/ui, TanStack Table | ~60 list screens share one data-table component (filters, paging, export) |
| Forms | react-hook-form + zod | Same zod schema validates client and server |
| Database | Supabase Postgres | Accounting needs real transactions, constraints and SQL reporting |
| Data access | supabase-js with generated types; SQL functions for posting & reports | RLS stays the single tenancy guard; reports run in the database, not in JS loops |
| Migrations | Supabase CLI (`supabase/migrations/*.sql`) | Plain SQL, reviewable, applied in order |
| Auth | Supabase Auth (email + password, Google later) | Same JWT drives RLS via `auth.uid()` |
| Files | Supabase Storage (private buckets) | Logos, passenger documents, import files |
| PDF | `@react-pdf/renderer` in a route handler | Invoices, credit notes, vouchers, quotations, statements |
| Excel | SheetJS (`xlsx`) | Supplier/GDS imports, register exports |
| Email | Resend | Send documents with PDF attachment |
| Payments | Razorpay or Cashfree Payment Links (official API, your keys) | Indian UPI/cards; webhook → receipt voucher |
| E-invoice | A GSP's IRN API (later milestone) | Required only above the turnover threshold |
| Jobs | Vercel Cron | Follow-up reminders, link expiry, nightly checks |
| Hosting | Vercel (app) + Supabase (Mumbai region `ap-south-1`) | Data stays in India; low latency |

One database, one app. No microservices.

## 2. Data model

`supabase/migrations/` — **43 tables, 2 views, posting + RPC functions**, tested on real Postgres
(`npm run test:db`, 82 checks; `npm run test:unit`, 18 checks).

| Area | Tables |
|---|---|
| Platform | orgs, roles, org_members, org_invites, financial_years, doc_series |
| Reference (global) | countries, states (with GST state code), cities, airlines (global + org) |
| Masters | account_groups, ledgers, opening_balances, lookups, sectors, passengers, passenger_documents |
| CRM | leads, lead_followups, routes, policies, itineraries, itinerary_days, hotels, hotel_rates, activity_rates, vehicles, quotations, quotation_items |
| Billing | invoices (invoice / proforma / credit note), invoice_lines, hotel_vouchers |
| Purchase | purchase_bills (general / group), purchase_bill_lines |
| Vouchers | vouchers, voucher_lines, bill_allocations |
| General ledger | ledger_entries |
| Integrations | import_batches, import_rows, payment_links, webhook_events, message_templates |

### Key decisions
- **Money is BIGINT paise.** Display formatting (₹1,23,456.00) happens only in the UI.
- **One invoice line = sale + purchase.** Each ticket/room line holds what the client pays *and*
  what the supplier charges (plus commission and TDS). Margin, loss alerts and GSTR-2 all read this.
  Check constraints enforce `net_sale = basic + xt + fee + other − discount + taxes` and
  `net_purchase = purchase_gross − commission + tds`.
- **Double-entry GL.** Only `app.post_invoice`, `app.post_voucher` and `app.post_purchase_bill`
  write `ledger_entries`; users can only read it. A deferred constraint trigger rejects any document
  whose entries don't balance, and another rejects entries in a closed year or outside the year.
  Ledger, cash/bank/day book, trial balance, P&L, balance sheet and outstanding are all queries
  over `ledger_entries` + `opening_balances` (`app.ledger_balances`).
- **Credit notes reverse by sign**: same lines table, posting flips Dr/Cr. Cancellation charges are a
  `cancellation_charge` line.
- **GST split** (CGST+SGST vs IGST) is decided by comparing the org's state with the place of supply;
  a constraint forbids both on one line.
- **Gap-free numbering per type per year** via `app.next_doc_no` (row-locked counter).
- **Small masters share one `lookups` table** (16 kinds), so 16 screens are one component.
- **Financial years** can't overlap (exclusion constraint); closing a year locks its entries.

### Access rules
- **Tenancy = RLS.** Every tenant table has `org_id`; the policy is `app.is_member(org_id)`.
  Global reference tables are read-only. Posted invoices/bills can't be deleted (restrictive policy).
- **Permissions = server actions.** Each action calls `app.can(org, module, action)` before acting
  (the posting functions check it themselves). Roles store `{module: [actions]}`; Owner bypasses.
- The Supabase service-role key is used only in webhook handlers and cron, never in the browser.

## 3. API (server actions and route handlers)

All actions take the active `org_id` + `fy_id` from the session (org switcher + year switcher).

**Auth & setup**
| Route / action | Does | Who |
|---|---|---|
| `/signup`, `/login`, `/auth/callback` | Supabase Auth | public |
| `createOrg(name, state, fyStart)` → `app.create_org` | Org, owner role, year, chart of accounts, 29 system ledgers, number series | signed-in |
| `updateOrg`, `uploadLogo`, `saveBankDetails`, `saveTerms`, `saveSeries` | Company setup | org.edit |
| `inviteMember`, `acceptInvite`, `updateMember`, `saveRole` | Users & roles | users.edit |
| `createYear`, `closeYear`, `transferBalances` | Year end | accounts.admin |

**Masters** — generic `listX / saveX / deleteX` for ledgers, groups, passengers, airlines, sectors,
cities, lookups(kind), hotels, rates, vehicles, routes, itineraries, policies.

**CRM**
| Action | Does |
|---|---|
| `listLeads(filters)` | Status/service/source/assignee/date filters + status counts |
| `saveLead`, `assignLead`, `transferLeads(from, to, statuses)` | Create/edit/reassign |
| `addFollowup`, `completeFollowup` | Trigger keeps `leads.next_followup_at` current |
| `crmDashboard(scope: self\|team)` | Funnel, pendency ageing, value buckets, trips |
| `saveQuotation`, `priceFromRates(itinerary, class, dates, pax)`, `markQuotation(status)` | Build quote from rate masters |
| `convertQuotationToProforma`, `convertProformaToInvoice` | Carry lines forward |

**Billing & purchase**
| Action | Does |
|---|---|
| `listInvoices(filters)` | Uses `v_invoice_balance` for Paid/Unpaid/Partial |
| `saveInvoice(header, lines)` | Draft; server recomputes GST & totals from lines (never trusts client) |
| `postInvoice(id)` → `app.post_invoice` | Writes GL |
| `createCreditNote(invoiceId, lines, charges)` | Reversal + charges |
| `saveHotelVoucher`, `savePurchaseBill`, `postPurchaseBill` | — |
| `GET /api/pdf/[doc]/[id]` | PDF render |
| `sendDocument(doc, id, channel)` | Email with PDF |
| `importBilling(file, format)` → preview rows → `generateInvoices(batchId, rowIds)` | Supplier/GDS Excel |

**Vouchers & accounts**
| Action | Does |
|---|---|
| `saveVoucher(kind, header, lines)` + `postVoucher` | Receipt/payment/contra/journal, single or multi |
| `allocate(voucherId, [{invoiceId, amount}])` | Bill adjustment |
| `ledgerStatement`, `dayBook`, `cashBook`, `bankBook` | Reports |
| `trialBalance`, `profitLoss`, `balanceSheet` | From `app.ledger_balances` grouped by account tree |
| `outstanding(type, asOn)`, `ageing(asOn)`, `billWise(ledger)` | From `v_invoice_balance` |
| `gstr1(from, to)` + `GET /api/gst/gstr1.json` | B2B, B2CL, B2CS, CDNR, CDNUR, HSN |
| `gstr2`, `gstr3b`, `salesRegister`, `purchaseRegister`, `alerts(kind)` | — |

**Webhooks & jobs**
| Endpoint / schedule | Does |
|---|---|
| `POST /api/webhooks/razorpay` (or `/cashfree`) | Verify signature → insert into `webhook_events` (idempotent) → mark link paid → create & post receipt voucher |
| Cron 08:00 IST daily | Email each user their follow-ups due today and overdue |
| Cron hourly | Expire stale payment links |
| Cron nightly | Integrity check: every posted doc balanced; alert counts for top bar |

Only official public APIs with Apna Flight's own keys. Nothing calls the reference app.

## 4. The parts that bite

1. **GST correctness for travel.** Air tickets: GST applies on the agent's service fee, fare + XT
   are pass-through; hotels/tours have their own rates and options; place of supply decides
   CGST/SGST vs IGST. Rates live in config, not code; an accountant should check them before go-live.
2. **Accounting integrity.** Editing a posted invoice must re-post it in one transaction (the post
   functions delete and rewrite that document's entries). Closed years are locked in the database.
3. **Supplier/GDS Excel imports.** Every supplier's file has a different layout. Build a column-mapping
   step with saved mappings per format rather than hard-coded parsers.
4. Concurrency: document numbers use a row lock (safe); two people editing one invoice use
   `updated_at` optimistic checks.
5. Time zones: business dates are `date` in IST; follow-up slots are `timestamptz` shown in IST.
6. Webhooks arrive twice → `webhook_events` primary key makes processing idempotent.
7. Report speed: GL queries are indexed on `(org_id, ledger_id, entry_date)`; fine to millions of rows.
8. Multi-tenancy leaks: covered by RLS + tests; every new table must be added to the RLS list.
9. Storage: passenger documents are personal data → private bucket, signed URLs, delete on request.

## 5. Build order

**M1 — Vertical slice (core loop end-to-end)**
Sign up → create company → add customer & supplier ledgers → new lead → domestic flight invoice with
GST → post → receipt → ledger statement shows the balance going to zero.
Screens: login, org setup, ledgers, leads list/form, invoice list/form (Domestic), receipt, ledger report.
Features: F01–F03, F05–F08, F10, F13–F14, F24 (lead→invoice), F25 (domestic), F26, F38 (receipt), F42.

**M2 — Daily operations** ✅
All 10 invoice types, credit notes (with cancellation charges), lead assignment, payment/contra/journal,
bill-wise adjustment, general purchase, cash/bank/day book, lookups, passengers, dashboard charts.
(Server-side PDF + email moved to M6 with the other integrations; browser print/PDF works today.)

**M3 — Holiday packages (CRM depth)** ✅
Itineraries, policies, hotels + rates, activities, vehicles, routes, quotation builder with print,
proforma, hotel vouchers.

**M4 — Books & compliance** ✅ (group purchase, multi-party vouchers and pending lists moved to M5)
Trial balance, P&L, balance sheet, outstanding/ageing, GSTR-1 (+JSON), GSTR-2, GSTR-3B, sales &
purchase registers, group purchase, multi-line vouchers, year close & balance transfer.

**M5 — Team & insight**
Roles & permissions UI, user hierarchy, CRM dashboard, alerts, mobile layout.

**M6 — Integrations**
Excel imports (billing, vouchers, ledgers), payment links + webhook, e-invoice IRN, bulk printing,
message templates, voucher renumbering.

## 6. Repository layout (planned)

```
app/(auth)/login, signup
app/(app)/[org]/dashboard | crm/... | billing/... | purchase/... | vouchers/... | accounts/... | gst/... | masters/... | settings/...
app/api/pdf, api/gst, api/webhooks, api/cron
components/ui (shadcn), components/data-table, components/forms
lib/supabase (server/client), lib/money.ts, lib/gst.ts, lib/permissions.ts
supabase/migrations/*.sql           (schema, RPCs, reference data)
tests/db.test.mjs                   (runs all migrations on PGlite)
```
