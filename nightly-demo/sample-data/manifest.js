// Sample data for development/demo -- do not edit by hand.
// In a real deployment this is built by an external data pipeline, not by hand.
// Compare gen_max_cnt vs db_max_cnt per source to decide whether a file needs
// regenerating.
window.DS_MANIFEST = {
  "generated_at": 1706750000.0,
  "db_max_cnt": 271,
  "sources": [
    {
      "name": "CRM",
      "file": "CRM.js",
      "key": "customer_id",
      "description": "CRM: customers and contacts, exported from a cloud CRM once a day",
      "as_of": 1706745600.0,
      "generated_at": 1706750000.0,
      "gen_max_cnt": 169,
      "db_max_cnt": 271,
      "rows": 54,
      "labels": [
        "email",
        "phone",
        "status"
      ],
      "label_types": {
        "email": "text",
        "phone": "text",
        "status": "text"
      }
    },
    {
      "name": "ERP",
      "file": "ERP.js",
      "key": "client_ref",
      "description": "ERP: SKU prices and stock levels, exported from an accounting system once a day",
      "as_of": 1706745600.0,
      "generated_at": 1706750000.0,
      "gen_max_cnt": 269,
      "db_max_cnt": 269,
      "rows": 53,
      "labels": [
        "price",
        "stock"
      ],
      "label_types": {
        "price": "number",
        "stock": "number"
      }
    }
  ]
};
