+++
title = "Join two sources"
weight = 1
description = "A CRM and an ERP export, joined on a shared customer id."
+++

**Task:** you have a CRM export (customers) and an ERP export (prices and
stock), and want one table with both.

1. On **Data**, check both sources.
2. A join row appears for the second source. Pick the join type (`LEFT` to
   keep every CRM row even without an ERP match is usually the right
   default) and the matching field on each side (e.g. `customer_id` ↔
   `client_ref`).
3. Check the fields you want from each source.
4. Open **Table** — the result has one row per matched (or unmatched, for
   `LEFT`/`RIGHT`/`FULL`) pair.

*(More recipes — conditions, formulas, grouping with aggregates — coming
soon.)*
