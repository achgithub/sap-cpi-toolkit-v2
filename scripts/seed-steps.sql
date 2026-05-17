-- Seed flow diagram steps for IF-S4-SF-01 (Customer Master → Salesforce Account)
-- Creates 3 nodes (S4, CPI, Salesforce) with 35 steps total so the
-- Show Steps panel has real data to visualise.

DO $$
DECLARE
  v_iface UUID;
BEGIN
  SELECT id INTO v_iface FROM interfaces WHERE ref = 'IF-S4-SF-01';
  IF v_iface IS NULL THEN
    RAISE NOTICE 'IF-S4-SF-01 not found — skipping.';
    RETURN;
  END IF;

  UPDATE interfaces SET flow_diagram_state = $json${
    "nodes": [
      {
        "id": "nd-s4", "type": "system", "label": "SAP S/4HANA Production",
        "x": 60, "y": 180, "width": 160, "height": 100,
        "color": "#1565C0", "fontSize": 13, "nodeKey": "sender",
        "steps": [
          { "id": "s1",  "num": 1,  "text": "IDoc DEBMAS triggered",   "notes": "Business partner change event fires DEBMAS06 IDoc via partner profile. Triggered by BP transaction or batch job." },
          { "id": "s2",  "num": 2,  "text": "Outbound IDoc created",    "notes": "IDoc written to outbound queue with status 03 (passed to port)." },
          { "id": "s3",  "num": 3,  "text": "Serialisation check",      "notes": "Serialisation group CHK_CUST ensures ordering. Held if earlier IDoc still processing." },
          { "id": "s4",  "num": 4,  "text": "Port determination",       "notes": "Logical port CPI_HTTPS_PORT resolved to CPI tenant endpoint via partner profile." },
          { "id": "s5",  "num": 5,  "text": "HTTP POST to CPI",         "notes": "IDoc XML posted to CPI integration flow endpoint over mTLS. Certificate alias: S4_CPI_CLIENT." },
          { "id": "s6",  "num": 6,  "text": "Acknowledgement received", "notes": "CPI returns HTTP 200 with correlation ID. IDoc status updated to 12 (dispatch OK)." },
          { "id": "s7",  "num": 7,  "text": "Timeout / retry logic",    "notes": "If no ACK within 30s, IDoc status set to 02 and retried up to 3 times via report RSEOUT00." },
          { "id": "s8",  "num": 8,  "text": "Error notification",       "notes": "Status 02 after max retries triggers workflow task to S4_INT_MONITOR role via SWI1." },
          { "id": "s9",  "num": 9,  "text": "Audit log entry",          "notes": "IDOC_AUDIT_LOG table entry written for compliance. Retained 90 days per data retention policy." },
          { "id": "s10", "num": 10, "text": "Delta filter applied",      "notes": "Change document check prevents re-sending unchanged fields. Only modified segments transmitted." },
          { "id": "s11", "num": 11, "text": "Segment E1KNA1M extracted", "notes": "General customer data: KUNNR, NAME1, STRAS, ORT01, LAND1, SPRAS mapped from KNA1 table." },
          { "id": "s12", "num": 12, "text": "Segment E1KNVVM extracted","notes": "Sales area data mapped from KNVV. Only sales org 1000 and 2000 included per scope document." }
        ]
      },
      {
        "id": "nd-cpi", "type": "hop", "label": "SAP Cloud Integration",
        "x": 300, "y": 180, "width": 160, "height": 100,
        "color": "#E65100", "fontSize": 13, "nodeKey": "via-0",
        "steps": [
          { "id": "s13", "num": 13, "text": "Message received",          "notes": "Integration flow IF_S4_SF_CustomerMaster_v3 triggered. Message logged to MPL with correlation ID from S4." },
          { "id": "s14", "num": 14, "text": "Schema validation",         "notes": "Incoming IDoc XML validated against DEBMAS06.xsd. Hard stop on schema violation — error routed to DLQ." },
          { "id": "s15", "num": 15, "text": "Duplicate check",           "notes": "IDOC_NUMBER + S4_MANDANT checked in CPI idempotency store. TTL 48h. Duplicate silently discarded." },
          { "id": "s16", "num": 16, "text": "Content enrichment",        "notes": "Credit limit fetched from S4 RFC FM SD_FI_GET_CUSTOMER_CREDIT via CPI RFC adapter. Injected as header CreditLimit." },
          { "id": "s17", "num": 17, "text": "Account type lookup",       "notes": "Customer account group (KTOKD) mapped to Salesforce RecordTypeId via value mapping table VM_ACCT_TYPE." },
          { "id": "s18", "num": 18, "text": "XSLT transformation",       "notes": "IDoc XML → Salesforce Account JSON via XSLT 2.0. Stylesheet: CustomerMaster_to_SF_Account_v3.xsl." },
          { "id": "s19", "num": 19, "text": "Phone normalisation",       "notes": "E.164 format enforced on TELF1. Country code prepended using LAND1. Invalid numbers set to null (not rejected)." },
          { "id": "s20", "num": 20, "text": "Address validation",        "notes": "Postcode/country combo validated against CPI lookup table loaded from SharePoint weekly. Mismatch flagged, not blocked." },
          { "id": "s21", "num": 21, "text": "Payment terms mapping",     "notes": "ZTERM code mapped to Salesforce custom field Payment_Terms__c via value mapping VM_PAYMENT_TERMS." },
          { "id": "s22", "num": 22, "text": "External ID assignment",    "notes": "Salesforce ExternalId set to S4_MANDT + KUNNR (e.g. 100-0000001234). Used as upsert key on SF side." },
          { "id": "s23", "num": 23, "text": "Retry wrapper applied",     "notes": "CPI retry policy: 3 attempts, exponential backoff starting 5s. Permanent errors go to dead letter queue CPI_DLQ_SF." },
          { "id": "s24", "num": 24, "text": "SF API version check",      "notes": "Target API version pinned to v59.0 in adapter config. Upgraded only during scheduled maintenance window." },
          { "id": "s25", "num": 25, "text": "OAuth token retrieved",     "notes": "Client credentials flow. Token cached in CPI secure store, refreshed 60s before expiry. Alias: SF_OAUTH_PROD." },
          { "id": "s26", "num": 26, "text": "HTTP POST to Salesforce",   "notes": "PATCH /services/data/v59.0/sobjects/Account/ExternalId__c/<id>. Upsert semantics — creates if not found." },
          { "id": "s27", "num": 27, "text": "Response handling",         "notes": "HTTP 200/201 → success. 400 body parsed for field-level errors. 429 → immediate retry with Retry-After header." },
          { "id": "s28", "num": 28, "text": "MPL success entry",         "notes": "Message processing log updated: status COMPLETED, SF Account ID written to custom header SF_ACCOUNT_ID." }
        ]
      },
      {
        "id": "nd-sf", "type": "system", "label": "Salesforce CRM",
        "x": 540, "y": 180, "width": 160, "height": 100,
        "color": "#1B5E20", "fontSize": 13, "nodeKey": "recv-0",
        "steps": [
          { "id": "s29", "num": 29, "text": "Upsert via External ID",    "notes": "Account record matched on ExternalId__c = S4_MANDT+KUNNR. Created if first sync, updated thereafter." },
          { "id": "s30", "num": 30, "text": "Record type assignment",    "notes": "RecordType set to Business_Account or Consumer based on KTOKD mapping. Cannot be changed after creation." },
          { "id": "s31", "num": 31, "text": "Territory auto-assign",     "notes": "Assignment rule Territory_EMEA fires on save. Based on BillingCountry field. Cannot be suppressed via API." },
          { "id": "s32", "num": 32, "text": "Ownership rule evaluated",  "notes": "New accounts: owner set to INTEGRATION_USER. Existing accounts: owner unchanged (no override). See SF config doc §4.2." },
          { "id": "s33", "num": 33, "text": "Duplicate rule check",      "notes": "SF duplicate rule DUP_ACCOUNT_NAME fires on every save. Alert only (no block). Sales rep notified via Chatter." },
          { "id": "s34", "num": 34, "text": "Validation rules fire",     "notes": "3 active validation rules on Account: VR_ACCOUNT_TYPE, VR_BILLING_REQUIRED, VR_CREDIT_LIMIT_FORMAT. Failures returned as 400." },
          { "id": "s35", "num": 35, "text": "Platform event published",  "notes": "AccountUpdated__e platform event fired post-save. Consumed by SF→S4 credit check flow and CPQ pricing engine." }
        ]
      }
    ],
    "edges": [
      { "id": "e1", "fromNodeId": "nd-s4",  "toNodeId": "nd-cpi", "path": [], "label": "", "arrow": "end" },
      { "id": "e2", "fromNodeId": "nd-cpi", "toNodeId": "nd-sf",  "path": [], "label": "", "arrow": "end" }
    ]
  }$json$ WHERE id = v_iface;

  RAISE NOTICE 'Seeded 35 steps on IF-S4-SF-01.';
END $$;
