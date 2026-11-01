// Sample data for development/demo -- do not edit by hand.
// The default preset for sample-data.
window.DS_BASE_PRESET = {
  "name": "base",
  "description": "CRM + ERP -- demo example",
  "query": {
    "as_of": null,
    "sources": {
      "CRM": {
        "labels": [
          "customer_id",
          "email",
          "phone",
          "status"
        ]
      },
      "ERP": {
        "labels": [
          "price",
          "stock"
        ]
      }
    }
  },
  "view": {
    "joins": [
      {
        "left": "CRM",
        "left_field": "customer_id",
        "right": "ERP",
        "right_field": "client_ref"
      }
    ],
    "conditions": [],
    "entityConditions": [],
    "entities": []
  }
};
