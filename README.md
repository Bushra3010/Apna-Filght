# Apna Flight

Travel ERP + CRM for Indian travel agencies: leads, quotations, invoicing with GST,
purchases, vouchers, double-entry accounts, outstanding and GST returns.

## Planning docs
- [replica/recon.md](replica/recon.md) — functional map of every module and screen
- [replica/features.csv](replica/features.csv) — 55 features with priority and milestone
- [replica/architecture.md](replica/architecture.md) — stack, data model, API, risks, build order
- [replica/schema.sql](replica/schema.sql) — Postgres/Supabase schema (43 tables, RLS, posting functions)

## Schema test
Runs the schema on an in-memory Postgres (PGlite) and checks tenancy, numbering,
invoice/receipt posting and that the books balance:

```bash
npm i @electric-sql/pglite@0.2.17
node replica/tests/schema.test.mjs replica/schema.sql
```

Secrets (Supabase keys, payment keys) go in `.env.local`, which git ignores.
