# Recon map — Travel ERP + CRM (reference app)

Captured 2026-11-16 from a logged-in account, read-only (nothing saved, edited or deleted).
Purpose: a functional spec for building **Apna Flight's own** ERP + CRM. Field and column
lists describe *what the software does*; the new app gets its own code, design, copy and name.

Totals: **~68 ERP screens + 20 CRM screens.** Most are one of four patterns:

| Pattern | Count | Shape |
|---|---|---|
| Simple master (name list) | ~25 | Search · list (Edit, Name, Delete) · New/Edit modal |
| Transaction list + entry form | ~15 | Date range · party search · paged table · New → form |
| Report | ~25 | Date range / as-on date · ledger filter · table · print/export |
| Dashboard | 3 | KPI tiles + charts |

---

## Global shell
- Top bar: alert bell (Invalid GST invoices, Pending purchases), financial-year switcher ("Yr"),
  user menu (My Profile, Change Password, Change Year, Sign Out), Plans & Upgrade.
- Sidebar with **ERP / CRM** toggle; mobile bottom nav: Home · Billing · Receipt · Account · Profile.
- Every list: date range (default = current FY), search, page size 10/15/20/50/100, pagination.
- Multi-company + financial-year scoping on all data.

---

## ERP

### Dashboard
Tiles: Sales, Receivable, Payable, Cash, Bank. Panels: Daybook, Monthly Sales (bar),
Outstanding ageing (7/15/30/60 days), Sales Source (₹ lacs), Margin Ratio (%), Next 5 Days — Operations.

### Lead → Proposal
- Lead list (shared with CRM, below). Proposal/Proforma Invoice (link not reachable in this account).

### Billing
- **Invoice** — list columns: Bill No/Date, Invoice No, Bill Type, Bill Date, Due Date, Party, Bill Amount,
  Adjusted, Status, Cancellation, Actions (edit/print/email). Filters: Bill Type, Bill Dues, Sale/Purchase,
  status (All/Paid/Unpaid/Cancelled/Partial/Not cancelled).
  - **Invoice types:** Domestic, International, Hotel, Visa/Insurance, Train/Bus, Taxi, Misc/Service,
    Bill of Supply, Tour, Commission.
  - Header: Invoice No, Invoice Date, Party/Client, Booked By, Phone, Place of Supply (validated → drives CGST+SGST vs IGST).
  - Line (air ticket) fields, from import/alert screens: Passenger, Airline, Flight, Date, Route/Sector,
    Ticket No, PNR, Basic, XT (taxes), Fee, OC (other charges), Taxable, Tax %, SGST/CGST/IGST, Net Sale;
    linked purchase side: Supplier, Supplier invoice no/date, Net Purchase, TDS, Commission.
  - **Each invoice carries both a sale and a purchase** → margin = sale − purchase (loss alerts use this).
- **Cancellation (credit note)** — Type, Credit Note No/Date, Invoice, Party, Invoice Amount, Charges, Refund.
- **Multiple Printing** — bulk print Invoices / Credit Notes / Vouchers by date & type.
- **Hotel/Cruise Voucher** — Voucher No/Date, Party, Type, Hotel/Cruise, Guest, Check-in, Check-out,
  Room/Cabin type, contact; 2 print formats, email, message.
- **E-Invoice** — Invoice/Credit/Debit; Pending/Generated; Party, GSTIN, Taxable, SGST/CGST/IGST, Generate (IRN).
- **Online payment link** — Source (Subscription/AMC/Receipt/Booking/Client collection), Purpose, Ref,
  Amount, Customer Id, Name, Email, Mobile → pay link + Refresh Status.

### Purchase
- Pending Purchase (alert: sales without purchase).
- **Group Purchase / FD** — Supplier, Airline, Flight, PNR, Route, Date, Bill Amount, No of Pax, Pax billed.
- **General Purchase** — Bill No/Date, Party, Amount.
- **Excel Import for Billing** — import supplier/GDS reports (portal/GDS formats) → preview rows → Generate Invoice.
- Pending Billing (Interfacing) — imported bookings not yet invoiced (Journey date, Pax, Mobile, PNR…).

### Vouchers (double-entry)
- Receipt, Payment, Contra, Journal, Receipt Multiple, Payment Multiple.
  Receipt cols: Voucher No/Date, Party, Amount, Type (cash/bank/cheque/online), Deposit A/c, Cheque No/Date/Bank,
  Adjusted Amount, print/PDF/email/message, Copy.
- **Bill Adjustment** — match receipts/payments against pending bills (Unadjusted balances / Pending bills / Report).
- Excel Import for Vouchers — payments received, payments sent, payment-gateway receipts.

### Accounts reports
Ledger, Bank Book, Cash Book, Day Book (Date, Vch No, Type, Particular, Dr, Cr, Balance);
Opening Trial Balance (+ transfer details); Trial Balance (Opening, Dr, Cr, Balance; group tree; Dr=Cr check);
Profit & Loss; Balance Sheet.

### Outstanding
Receivable (Dr/Cr/both, as-on date), Day-wise ageing, Bill-wise (after due / all / with adjusted), Payable.

### GST
- GSTR-1: B2B, B2CL, B2CS, CDNR, CDNUR, B2C-Bill, B2CS-Cancellation, HSN; **JSON export** for the portal.
- GSTR-2: purchase-side tax incl. TDS & commission.
- GSTR-3B: output vs input tax summary.

### Sales reports
Sales Register (KPI + list; Sale, Cancellation, Cancellation earnings, by type, top parties; Excel export),
Sales Summary, Purchase Register (Basic, XT, SC, Taxable, taxes, Comm, TDS) + Purchase Return.

### Alerts
Invalid GST, Loss-making invoices, Loss-making credit notes, Gross sale vs gross purchase,
Invoice vs purchase date mismatch, …month mismatch.

### Masters
- **Ledger** (account/party): Name, Phone, GSTIN/PAN, City, State, Group, portal key; Excel import.
- **Group** (chart of accounts tree): Group, Under Group.
- **Passenger**: Name, Party, Address, Country, City, Mobile, Remark, Documents.
- Airline (Code, Name), Sector, Country, City (State, Country, code).
- Misc lists: Booked By, Service Type, Visa Type, Room Type, Room Category, Taxi Type, Meal Plan,
  Package Type, Follow-up Action.

### Users & organisation
- Users (Name, Designation, Role, Login ID), Roles (permissions), Message templates.
- Company setup — Profile (Name*, Address*, Country, State, City*, PIN, Phone, Mobile*, Email*, GSTIN, PAN),
  Bank Details, Terms (printed on invoices), **Series** (numbering per document type).
- Create Year, Balance Transfer (carry closing balances to new FY), Voucher Re-numbering.

---

## CRM

- **CRM Dashboard** — sales funnel (Self / Self & team): Live, Initial, Active, Proposal, Negotiation,
  Pipeline, Booked; follow-ups left; upcoming/running/open trips; proposal value buckets (<1, 1–3, 3–5, >5 lacs);
  lead pendency ageing (3–7, 8–15, 16–30, >30 days); Performance dashboard.
- **Leads** — list: Lead no, Enquiry date, Guest, Contact, Travel/start from, Service, Pax, PI no, PI amount,
  Next/Last follow-up, Status, Assigned. Filters: status, service, assigned to, source; count chips.
  - **New Lead form:** Guest name*, Email, Phone*, Party/Client*; Starting place, Expected travel date
    (or "date is open"); Services (Flight, Hotel, Visa, Tour Package, Transport, Train/Bus, Activities, Other);
    Pax: Adult*, Child >12, Child 6–12, Infant, Total; Source (Walk-in, Call, Email, WhatsApp, Website, IVR,
    Reference, Ads, Excel); Reference; Budget ₹; Remarks (250); **Next follow-up*** action
    (Call/Meeting fixed/Spoke/Proposal sent/Cancel) + date + 2-hour slot.
  - Statuses: Initial → Active → Proposal → Negotiation → Pipeline → Booking Confirmed / Not interested / Fake.
- **Lead Bank** — Lead Transfer (by salesperson × status), User Hierarchy (up to 6 reporting levels).
- **Itinerary** — Itinerary master (route/destinations, duration, day-wise plan), General & other policies, Package titles.
- **Quotation (B2C)** — Quotation No, Date, Client, Route, Package title, Meal plan; Not accepted / Accepted; print.
- **Packages** — Package class, Package title, Route/Destinations (transport/supplier flags), Activities.
- **Accommodation** — Hotel master (Name, Address, Contact, Phone, Mobile, Email, City, Country);
  **Rate master** (Package class, Room category, Meal plan, Pax/room, Rate type, Rate, date range);
  Room types; Additional hotel services.
- **Activities** — Activity rate (City, Location, Unit, Start, End, Duration, Rate type, Rate, Supplier rate).
- **Vehicles** — Vehicle (Name, Rate/km, Max km/day, Night charge, Capacity), Additional taxi services.
- Misc — Bank names, Destinations.

---

## Core data model (draft, for planning)
- org, financial_year, user, role, user_hierarchy, doc_series
- account_group (tree), ledger (party/bank/cash/expense…), passenger, airline, sector, country, state, city
- lookup (type + name) for all small masters
- lead, lead_followup, quotation, quotation_day, itinerary, hotel, hotel_rate, activity_rate, vehicle
- invoice (type, party, place_of_supply, totals) → invoice_line (pax/ticket/hotel… + sale & purchase amounts, taxes)
- credit_note, hotel_voucher, purchase_bill (general/group), import_batch/import_row
- voucher (receipt/payment/contra/journal) → **journal_entry lines (Dr/Cr per ledger)** — every invoice,
  credit note and voucher posts here; all books, TB, P&L, BS, outstanding are queries over it.
- bill_adjustment (voucher ↔ invoice allocations)
