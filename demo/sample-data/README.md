# sample-data/

A fake but realistically-shaped dataset for UI development and as a zero-config
demo: two sources wrapped in the lazy columnar source format, with a manifest, the
way a real producer would deliver them.

| File | What |
|---|---|
| `CRM.js` | `window.DS.sources["CRM"]` -- 54 records, fields `email` / `phone` / `status` |
| `ERP.js` | `window.DS.sources["ERP"]` -- 53 records, fields `price` / `stock`, key `client_ref` |
| `manifest.js` | `window.DS_MANIFEST` -- the index + freshness info for each source |
| `base.js` | `window.DS_BASE_PRESET` -- the default preset (a JOIN of CRM and ERP, see below) |

## What this set demonstrates

- **An update** -- `CRM/102.email` is `bob.new@example.com` (overwritten by a later
  batch), `status` is `vip`.
- **A delete -> null** -- `CRM/103.phone` and `ERP/102.stock` are `null` (the value
  was deleted at the source).
- **A missing key is not null** -- `CRM/104` has no `phone` key at all (there was no
  such record).
- **A LEFT JOIN with no match** -- `ERP/999` (`client_ref`) has no counterpart in
  CRM; `CRM/103` and `104` have no counterpart in ERP. The join is
  `CRM.customer_id <-> ERP.client_ref` (see `base.js`).
- **Staleness** -- in `manifest.js`, CRM's `db_max_cnt` > `gen_max_cnt`: one more CRM
  transaction (customer 105) landed after the file was generated, so the source is
  flagged "rebuild". ERP's are equal -- fresh.
- **Customers 106-155** -- fifty ordinary, fully-matched active customers, with no
  edge cases of their own -- just to give the table noticeably more rows (about 2-3
  screens), useful for testing scroll and the sticky header on Table.

## Using it in the app

For now, the page loads `data/manifest.js`. To try the sample:

```bash
cp sample-data/* data/    # then open index.html
```

(a dev mode that reads `sample-data/` directly is a possible future addition).
