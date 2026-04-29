package api

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SeedGroovyScripts inserts the built-in Groovy library scripts as assets
// (type='groovy') if none exist yet. Safe to call on every startup.
func SeedGroovyScripts(ctx context.Context, pool *pgxpool.Pool, log *slog.Logger) {
	var count int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM assets WHERE type='groovy' AND meta->>'builtin'='true'`).Scan(&count); err != nil {
		log.Error("groovy seed: count check failed", "error", err)
		return
	}
	if count >= len(groovySeeds) { //nolint:gocritic
		return
	}
	log.Info("seeding built-in Groovy scripts", "count", len(groovySeeds))
	for _, s := range groovySeeds {
		metaJSON, _ := json.Marshal(s.meta)
		_, err := pool.Exec(ctx, `
			INSERT INTO assets (name, type, content, meta, created_by)
			VALUES ($1, 'groovy', $2, $3, 'system')
			ON CONFLICT DO NOTHING`,
			s.name, s.body, metaJSON,
		)
		if err != nil {
			log.Error("groovy seed: insert failed", "name", s.name, "error", err)
		}
	}
	log.Info("groovy seed complete")
}

type groovySeed struct {
	name string
	body string
	meta groovyMeta
}

type groovyMeta struct {
	Description  string   `json:"description"`
	Complexity   string   `json:"complexity"`
	Tags         []string `json:"tags"`
	TenantOnly   bool     `json:"tenant_only,omitempty"`
	SampleBody   string   `json:"sample_body,omitempty"`
	SampleHdrs   string   `json:"sample_headers,omitempty"`
	SampleProps  string   `json:"sample_props,omitempty"`
	Builtin      bool     `json:"builtin"`
}

// ── Sample payloads ───────────────────────────────────────────────────────────

const samplePOXML = `<?xml version="1.0" encoding="UTF-8"?>
<PurchaseOrder>
  <Header>
    <OrderNumber>PO-2026-001</OrderNumber>
    <OrderDate>20260115</OrderDate>
    <DocumentType>NB</DocumentType>
    <Currency>EUR</Currency>
    <Status>NEW</Status>
  </Header>
  <Supplier>
    <Name>Global Supplies GmbH</Name>
    <SupplierID>SUP-4711</SupplierID>
  </Supplier>
  <Items>
    <Item lineNumber="1">
      <MaterialNumber>MAT-001</MaterialNumber>
      <Description>Industrial Widget Type A</Description>
      <Quantity unit="EA">50</Quantity>
      <UnitPrice>12.50</UnitPrice>
    </Item>
    <Item lineNumber="2">
      <MaterialNumber>MAT-002</MaterialNumber>
      <Description>Steel Bracket 200mm</Description>
      <Quantity unit="EA">100</Quantity>
      <UnitPrice>4.75</UnitPrice>
    </Item>
  </Items>
  <Totals>
    <NetAmount>1100.00</NetAmount>
    <TaxAmount>209.00</TaxAmount>
    <GrossAmount>1309.00</GrossAmount>
  </Totals>
</PurchaseOrder>`

const stdHeaders = `Content-Type: application/xml
SAP_MessageProcessingLogID: MPL-IDE-2026-001
SenderSystemID: S4H-CLNT100
X-CorrelationID: CORR-2026-ABC-001`

const jsonHeaders = `Content-Type: application/json
SAP_MessageProcessingLogID: MPL-IDE-2026-001
SenderSystemID: S4H-CLNT100
X-CorrelationID: CORR-2026-ABC-001`

const sampleJSONOrder = `{"Order":{"Header":{"OrderID":"ORD-2026-001","OrderDate":"20260115","Currency":"EUR","BuyerName":"ACME Corp"},"Items":{"Item":[{"LineNumber":"1","MaterialNumber":"MAT-001","Description":"Industrial Widget Type A","Quantity":"50","Unit":"EA","UnitPrice":"12.50"},{"LineNumber":"2","MaterialNumber":"MAT-002","Description":"Steel Bracket 200mm","Quantity":"100","Unit":"EA","UnitPrice":"4.75"}]}}}`

const sampleJSONStringTyped = `{"IsActive":"true","IsBlocked":"false","TotalItems":"2","NetAmount":"1100.00","Items":[{"LineNumber":"1","Quantity":"50","UnitPrice":"12.50","Taxable":"true","Description":"Industrial Widget Type A"},{"LineNumber":"2","Quantity":"100","UnitPrice":"4.75","Taxable":"false","Description":"Steel Bracket 200mm"}]}`

const sampleXMLForCSV = `<?xml version="1.0" encoding="UTF-8"?>
<PurchaseOrder>
  <Items>
    <Item>
      <MaterialNumber>MAT-001</MaterialNumber>
      <Description>Industrial Widget Type A</Description>
      <Quantity>50</Quantity>
      <Unit>EA</Unit>
      <UnitPrice>12.50</UnitPrice>
    </Item>
    <Item>
      <MaterialNumber>MAT-002</MaterialNumber>
      <Description>Steel Bracket 200mm</Description>
      <Quantity>100</Quantity>
      <Unit>EA</Unit>
      <UnitPrice>4.75</UnitPrice>
    </Item>
    <Item>
      <MaterialNumber>MAT-003</MaterialNumber>
      <Description>Mounting Kit, Standard</Description>
      <Quantity>25</Quantity>
      <Unit>EA</Unit>
      <UnitPrice>8.90</UnitPrice>
    </Item>
  </Items>
</PurchaseOrder>`

const sampleIDocLongtext = `<?xml version="1.0" encoding="UTF-8"?>
<ORDERS05>
  <IDOC BEGIN="1">
    <E1EDKT1 SEGMENT="1">
      <TDLINE>This is a very long delivery note text that needs to be split into multiple 132-character segments for proper IDoc processing. The segmentation must respect word boundaries so that words are not split across lines. This ensures the text remains readable when displayed in SAP. Additional text continues here to demonstrate the splitting behaviour across multiple output segments being generated for this example payload.</TDLINE>
    </E1EDKT1>
  </IDOC>
</ORDERS05>`

const sampleFIPostingXML = `<?xml version="1.0" encoding="UTF-8"?>
<FIPosting>
  <Header>
    <DocumentType>KR</DocumentType>
    <CompanyCode>1000</CompanyCode>
    <PostingDate>20260115</PostingDate>
    <Currency>EUR</Currency>
  </Header>
  <Vendor>
    <VendorID>VEND-001</VendorID>
    <Name>Global Supplies GmbH</Name>
  </Vendor>
  <Amount>1309.00</Amount>
</FIPosting>`

// ── Seeds ─────────────────────────────────────────────────────────────────────

var groovySeeds = []groovySeed{
	{
		name: "Log Payload as MPL Attachment",
		meta: groovyMeta{
			Description: "Writes the current message body to the Message Processing Log as a named attachment. The attachment appears in the CPI Monitoring UI under the message run.",
			Complexity:  "Beginner",
			Tags:        []string{"Logging", "Debugging"},
			SampleBody:  samplePOXML,
			SampleHdrs:  stdHeaders,
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def body = message.getBody(String) as String

    def mpl = messageLogFactory.getMessageLog(message)
    if (mpl != null) {
        mpl.setStringProperty("Logged", "true")
        mpl.addAttachmentAsString("Payload", body, "text/plain")
    }

    return message
}`,
	},
	{
		name: "Log All Headers and Properties",
		meta: groovyMeta{
			Description: "Dumps every message header and exchange property into a single MPL attachment. Invaluable when debugging why a Router condition is not matching.",
			Complexity:  "Beginner",
			Tags:        []string{"Logging", "Debugging"},
			SampleBody:  samplePOXML,
			SampleHdrs:  stdHeaders,
			SampleProps: "SAP_MplCorrelationId: CORR-TEST-001\nSenderSystem: S4H-CLNT100\nTargetSystem: ECC-300\nDocumentType: NB",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def mpl = messageLogFactory.getMessageLog(message)
    if (mpl == null) return message

    def sb = new StringBuilder()

    sb.append("=== HEADERS ").append("=".multiply(60)).append("\n")
    message.getHeaders().each { key, val ->
        sb.append(String.format("  %-45s %s%n", key, val))
    }

    sb.append("\n=== PROPERTIES ").append("=".multiply(57)).append("\n")
    message.getProperties().each { key, val ->
        sb.append(String.format("  %-45s %s%n", key, val))
    }

    mpl.addAttachmentAsString("MessageContext", sb.toString(), "text/plain")
    return message
}`,
	},
	{
		name: "Read Credentials from Secure Store",
		meta: groovyMeta{
			Description: "Retrieves a username and password from a named User Credentials artifact stored in CPI Security Material.",
			Complexity:  "Intermediate",
			Tags:        []string{"Security"},
			TenantOnly:  true,
			SampleProps: "CredentialAlias: BackendSystemPRD",
			Builtin:     true,
		},
		body: `// ⚠  TENANT-ONLY SCRIPT
// Uses ITApiFactory / SecureStoreService, only available inside a real CPI runtime.

import com.sap.gateway.ip.core.customdev.util.Message
// import com.sap.it.api.ITApiFactory
// import com.sap.it.api.securestore.SecureStoreService

def Message processData(Message message) {
    def props = message.getProperties()
    def alias = (props.get("CredentialAlias") ?: "MySystemCredential") as String

    // ── Uncomment when deployed on a CPI tenant ────────────────────────────
    // def svc  = ITApiFactory.getService(SecureStoreService.class, null)
    // def cred = svc.getUserCredential(alias)
    // if (cred == null) throw new Exception("Credential not found: " + alias)
    // message.setProperty("BackendUser",     cred.getUsername().toString())
    // message.setProperty("BackendPassword", new String(cred.getPassword()))
    // ─────────────────────────────────────────────────────────────────────

    message.setProperty("BackendUser",     "testuser")
    message.setProperty("BackendPassword", "testpass")
    return message
}`,
	},
	{
		name: "Call External REST API with Basic Auth",
		meta: groovyMeta{
			Description: "Makes a synchronous HTTP GET call to a REST endpoint from inside a Script step using Basic Authentication.",
			Complexity:  "Intermediate",
			Tags:        []string{"HTTP", "JSON"},
			SampleProps: "LookupUrl: https://httpbin.org/get\nBackendUser: testuser\nBackendPassword: testpass",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper

def Message processData(Message message) {
    def props = message.getProperties()

    def url      = (props.get("LookupUrl")       ?: "") as String
    def username = (props.get("BackendUser")      ?: "") as String
    def password = (props.get("BackendPassword")  ?: "") as String

    if (!url) throw new Exception("Exchange property 'LookupUrl' is required")

    def basicAuth = (username + ":" + password).bytes.encodeBase64().toString()

    def conn = new URL(url).openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.setRequestProperty("Accept",        "application/json")
    conn.setRequestProperty("Authorization", "Basic " + basicAuth)
    conn.connectTimeout = 10_000
    conn.readTimeout    = 30_000
    conn.connect()

    def status = conn.responseCode
    message.setProperty("LookupHttpStatus", status.toString())

    if (status >= 200 && status < 300) {
        def responseText = conn.inputStream.getText("UTF-8")
        def json = new JsonSlurper().parseText(responseText)
        message.setProperty("LookupResult", json?.value?.toString() ?: "")
        message.setBody(responseText)
    } else {
        def errBody = conn.errorStream?.getText("UTF-8") ?: "(empty error body)"
        message.setProperty("LookupError", errBody)
        throw new Exception("Lookup call failed — HTTP " + status + ": " + errBody)
    }

    return message
}`,
	},
	{
		name: "Base64 Encode / Decode",
		meta: groovyMeta{
			Description: "Encodes the message body to Base64 or decodes it. Direction controlled by exchange property Base64Direction (encode or decode).",
			Complexity:  "Beginner",
			Tags:        []string{"Encoding", "Conversion"},
			SampleBody:  "Hello, SAP CPI World! This is a test payload for Base64 encoding.",
			SampleHdrs:  "Content-Type: text/plain",
			SampleProps: "Base64Direction: encode",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def direction = (message.getProperties().get("Base64Direction") ?: "encode")
                        .toString().toLowerCase().trim()
    def body      = message.getBody(String) as String

    switch (direction) {
        case "encode":
            message.setBody(body.bytes.encodeBase64().toString())
            break
        case "decode":
            try {
                def decoded = body.trim().decodeBase64()
                message.setBody(new ByteArrayInputStream(decoded))
            } catch (Exception e) {
                throw new Exception("Base64 decode failed: " + e.message)
            }
            break
        default:
            throw new Exception("Unknown Base64Direction: '" + direction + "'. Expected 'encode' or 'decode'.")
    }

    return message
}`,
	},
	{
		name: "XML Read, Modify and Re-serialise",
		meta: groovyMeta{
			Description: "The workhorse XML manipulation pattern. Parses an XML payload with XmlSlurper, reads node values, modifies elements, appends new children, and serialises back.",
			Complexity:  "Intermediate",
			Tags:        []string{"XML"},
			SampleBody:  samplePOXML,
			SampleHdrs:  stdHeaders,
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.XmlSlurper
import groovy.xml.XmlUtil

def Message processData(Message message) {
    def doc = new XmlSlurper().parseText(message.getBody(String) as String)

    message.setProperty("OrderID",      doc.Header.OrderID.text())
    message.setProperty("DocumentType", doc.Header.DocumentType.text())
    message.setProperty("SupplierName", doc.Supplier.Name.text())

    doc.Header.Status = "PROCESSING"

    def nowFmt = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")
    nowFmt.setTimeZone(TimeZone.getTimeZone("UTC"))
    def nowStr = nowFmt.format(new Date())

    doc.Header.appendNode {
        ProcessedAt(nowStr)
        ProcessedBy("CPI-IFLOW")
    }

    message.setBody(XmlUtil.serialize(doc))
    return message
}`,
	},
	{
		name: "Build XML from Scratch with MarkupBuilder",
		meta: groovyMeta{
			Description: "Constructs a well-formed XML document from exchange properties using Groovy MarkupBuilder. Used when building an FI document from SAP BAPI data.",
			Complexity:  "Intermediate",
			Tags:        []string{"XML"},
			SampleHdrs:  stdHeaders,
			SampleProps: "CompanyCode: 1000\nDocumentType: KR\nGLAccount: 0000400000\nAmount: 1500.00\nCurrency: EUR\nCostCentre: CC-1000\nTaxCode: V1",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.MarkupBuilder

def Message processData(Message message) {
    def props   = message.getProperties()
    def headers = message.getHeaders()

    def companyCode  = props.get("CompanyCode")  ?: "1000"
    def documentType = props.get("DocumentType") ?: "KR"
    def glAccount    = props.get("GLAccount")    ?: "0000400000"
    def amount       = props.get("Amount")       ?: "0.00"
    def currency     = props.get("Currency")     ?: "EUR"
    def postingDate  = new java.text.SimpleDateFormat("yyyyMMdd").format(new Date())
    def correlationId = headers.get("SAP_MessageProcessingLogID") ?: UUID.randomUUID().toString()

    def writer = new StringWriter()
    def xml    = new MarkupBuilder(writer)
    xml.mkp.xmlDeclaration(version: "1.0", encoding: "UTF-8")

    xml.FIDocument(xmlns: "urn:sap.com:fi:document:v1") {
        Header {
            CompanyCode(companyCode)
            DocumentType(documentType)
            PostingDate(postingDate)
            CorrelationID(correlationId)
        }
        LineItems {
            Item(lineNumber: "001") {
                GLAccount(glAccount)
                Amount(currency: currency, amount)
                CostCentre(props.get("CostCentre") ?: "CC-1000")
                TaxCode(props.get("TaxCode")       ?: "V1")
            }
        }
    }

    message.setBody(writer.toString())
    return message
}`,
	},
	{
		name: "JSON to JSON Transformation",
		meta: groovyMeta{
			Description: "Reads a nested JSON payload, filters and aggregates data using Groovy closures, and builds a new JSON structure. Avoids XML roundtrip.",
			Complexity:  "Intermediate",
			Tags:        []string{"JSON"},
			SampleBody:  sampleJSONOrder,
			SampleHdrs:  jsonHeaders,
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

def Message processData(Message message) {
    def input = new JsonSlurper().parse(message.getBody(java.io.Reader))

    def header = input.Order?.Header
    def lines  = input.Order?.Items?.Item ?: []

    def output = [
        purchaseOrder: [
            id:        header?.OrderID,
            date:      header?.OrderDate,
            currency:  header?.Currency ?: "EUR",
            buyer:     header?.BuyerName,
            lineCount: lines.size(),
            netAmount: lines.sum { (it.UnitPrice as Double) * (it.Quantity as Integer) } ?: 0.0,
            lines:     lines.collect { line -> [
                lineNumber:     line.LineNumber as Integer,
                materialNumber: line.MaterialNumber,
                description:    line.Description,
                quantity:       line.Quantity as Integer,
                unit:           line.Unit ?: "EA",
                unitPrice:      line.UnitPrice as Double,
                lineTotal:      (line.UnitPrice as Double) * (line.Quantity as Integer),
            ]}
        ]
    ]

    message.setBody(JsonOutput.prettyPrint(JsonOutput.toJson(output)))
    return message
}`,
	},
	{
		name: "Fix JSON Data Types After SAP Conversion",
		meta: groovyMeta{
			Description: "SAP's XML→JSON converter produces every value as a string. This script coerces fields to their correct types (integers, decimals, booleans).",
			Complexity:  "Intermediate",
			Tags:        []string{"JSON", "Conversion"},
			SampleBody:  sampleJSONStringTyped,
			SampleHdrs:  "Content-Type: application/json",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

def Message processData(Message message) {
    def json = new JsonSlurper().parseText(message.getBody(String) as String)

    json.IsActive   = Boolean.parseBoolean(json.IsActive?.toString()  ?: "false")
    json.IsBlocked  = Boolean.parseBoolean(json.IsBlocked?.toString() ?: "false")
    json.TotalItems = json.TotalItems?.toString()?.isInteger() ? json.TotalItems.toInteger() : 0
    json.NetAmount  = json.NetAmount?.toString()?.isDouble()   ? json.NetAmount.toDouble()   : 0.0

    json.Items?.each { item ->
        item.LineNumber = item.LineNumber?.toString()?.isInteger() ? item.LineNumber.toInteger() : 0
        item.Quantity   = item.Quantity?.toString()?.isInteger()   ? item.Quantity.toInteger()   : 0
        item.UnitPrice  = item.UnitPrice?.toString()?.isDouble()   ? item.UnitPrice.toDouble()   : 0.0
        item.Taxable    = Boolean.parseBoolean(item.Taxable?.toString() ?: "false")
        item.keySet().removeAll { key -> item[key]?.toString() == "" }
    }

    message.setBody(JsonOutput.toJson(json))
    return message
}`,
	},
	{
		name: "Dynamic Receiver Routing via Value Mapping",
		meta: groovyMeta{
			Description: "Resolves target backend URL, user, and client from CPI Value Mapping tables based on an environment property (DEV/QAS/PRD).",
			Complexity:  "Advanced",
			Tags:        []string{"Routing", "Security"},
			TenantOnly:  true,
			SampleProps: "TargetEnvironment: DEV",
			Builtin:     true,
		},
		body: `// ⚠  TENANT-ONLY SCRIPT
// Uses ITApiFactory / ValueMappingApi, only available inside a real CPI runtime.

import com.sap.gateway.ip.core.customdev.util.Message
// import com.sap.it.api.ITApiFactory
// import com.sap.it.api.mapping.ValueMappingApi

def Message processData(Message message) {
    def env = (message.getProperties().get("TargetEnvironment") ?: "").toString().toUpperCase()
    if (!env) throw new Exception("Exchange property 'TargetEnvironment' is not set (DEV / QAS / PRD)")

    def keyPrefix
    switch (env) {
        case "DEV": keyPrefix = "S4H_010"; break
        case "QAS": keyPrefix = "S4H_020"; break
        case "PRD": keyPrefix = "S4H_030"; break
        default:    throw new Exception("Unknown environment '" + env + "'")
    }

    // ── Uncomment when deployed on a CPI tenant ────────────────────────────
    // def vmApi  = ITApiFactory.getApi(ValueMappingApi.class, null)
    // def srcAgn = "ReceiverConfig"
    // def url    = vmApi.getMappedValue(srcAgn, "Parameter", keyPrefix + "_URL", srcAgn, "Value")
    // ─────────────────────────────────────────────────────────────────────

    message.setProperty("ReceiverUrl",    "https://" + keyPrefix.toLowerCase() + ".example.com/sap/opu")
    message.setProperty("ReceiverUser",   "svc_cpi_" + env.toLowerCase())
    message.setProperty("ReceiverClient", env == "PRD" ? "200" : "100")
    message.setProperty("ResolvedEnv",    env)
    return message
}`,
	},
	{
		name: "Date Format Conversion with Timezone Handling",
		meta: groovyMeta{
			Description: "Converts an incoming SAP compact date (yyyyMMdd) to multiple output formats including ISO 8601, OData, European display, and SAP time.",
			Complexity:  "Beginner",
			Tags:        []string{"Date/Time", "Conversion"},
			SampleProps: "SAPDate: 20260115\nSourceTimezone: UTC\nTargetTimezone: Europe/Berlin",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import java.text.SimpleDateFormat

def Message processData(Message message) {
    def props = message.getProperties()
    def inputStr = (props.get("SAPDate") ?: new SimpleDateFormat("yyyyMMdd").format(new Date())) as String
    def sourceTZ = (props.get("SourceTimezone") ?: "UTC") as String
    def targetTZ = (props.get("TargetTimezone") ?: "Europe/Berlin") as String

    def parseFmt = new SimpleDateFormat("yyyyMMdd")
    parseFmt.setTimeZone(TimeZone.getTimeZone(sourceTZ))
    def date = parseFmt.parse(inputStr)

    [
        Date_ISO8601:    ["yyyy-MM-dd'T'HH:mm:ss'Z'",  "UTC"],
        Date_ISO8601_TZ: ["yyyy-MM-dd'T'HH:mm:ssXXX",  targetTZ],
        Date_EU:         ["dd.MM.yyyy",                 targetTZ],
        Date_OData:      ["yyyy-MM-dd",                 "UTC"],
        Date_SAPCompact: ["yyyyMMdd",                   "UTC"],
        Date_Time:       ["HHmmss",                     "UTC"],
    ].each { propName, cfg ->
        def sdf = new SimpleDateFormat(cfg[0] as String)
        sdf.setTimeZone(TimeZone.getTimeZone(cfg[1] as String))
        message.setProperty(propName as String, sdf.format(date))
    }

    def nowFmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")
    nowFmt.setTimeZone(TimeZone.getTimeZone("UTC"))
    message.setProperty("ProcessedAt", nowFmt.format(new Date()))
    return message
}`,
	},
	{
		name: "Exception Handler: Extract SOAP Fault",
		meta: groovyMeta{
			Description: "Place in an Exception Subprocess after a SOAP receiver call. Reads CamelExceptionCaught, extracts the fault code and detail XML.",
			Complexity:  "Intermediate",
			Tags:        []string{"Error Handling"},
			SampleHdrs:  "Content-Type: application/xml",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.XmlUtil

def Message processData(Message message) {
    def ex = message.getProperties().get("CamelExceptionCaught")

    if (ex == null) {
        message.setProperty("ErrorType", "None")
        return message
    }

    def className = ex.getClass().getCanonicalName()
    message.setProperty("ExceptionClass",   className)
    message.setProperty("ExceptionMessage", ex.getMessage() ?: "(no message)")

    if (className == "org.apache.cxf.binding.soap.SoapFault") {
        def detail = XmlUtil.serialize(ex.getOrCreateDetail())
        message.setBody(detail)
        message.setProperty("ErrorType",    "SOAPFault")
        message.setProperty("FaultCode",    ex.getFaultCode()?.toString() ?: "")
        message.setProperty("FaultMessage", ex.getMessage() ?: "")
        messageLogFactory.getMessageLog(message)?.addAttachmentAsString("SOAPFaultDetail", detail, "application/xml")
    } else {
        def safe = { String s -> s?.replaceAll("&","&amp;")?.replaceAll("<","&lt;")?.replaceAll(">","&gt;") ?: "" }
        def tsFmt = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")
        tsFmt.setTimeZone(TimeZone.getTimeZone("UTC"))
        message.setBody("<Error><Type>" + ex.getClass().getSimpleName() +
            "</Type><Message>" + safe(ex.getMessage()) +
            "</Message><Timestamp>" + tsFmt.format(new Date()) + "</Timestamp></Error>")
        message.setProperty("ErrorType", "GenericException")
    }
    return message
}`,
	},
	{
		name: "Exception Handler: Capture HTTP Error Response",
		meta: groovyMeta{
			Description: "Place in an Exception Subprocess after an HTTP receiver call. Extracts HTTP status code, text, and response body from CamelExceptionCaught.",
			Complexity:  "Intermediate",
			Tags:        []string{"Error Handling", "HTTP"},
			SampleHdrs:  "Content-Type: application/json",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def ex = message.getProperties().get("CamelExceptionCaught")
    if (ex == null) return message

    def className = ex.getClass().getCanonicalName()

    if (className == "org.apache.camel.component.ahc.AhcOperationFailedException") {
        def code = ex.getStatusCode()
        def text = ex.getStatusText() ?: ""
        def body = ex.getResponseBody() ?: "(empty response body)"

        message.setProperty("HttpErrorCode", code.toString())
        message.setProperty("HttpErrorText", text)
        message.setProperty("HttpErrorBody", body)

        def mpl = messageLogFactory.getMessageLog(message)
        if (mpl != null) {
            mpl.setStringProperty("HttpStatus", code.toString() + " " + text)
            mpl.addAttachmentAsString("HttpErrorResponse", body, "text/plain")
        }

        message.setBody(body)
        message.setHeader("http.ResponseCode", code.toString())
    } else {
        message.setProperty("HttpErrorCode", "500")
        message.setProperty("HttpErrorBody", ex.getMessage() ?: className)
        message.setBody("<Error><Class>" + ex.getClass().getSimpleName() +
            "</Class><Message>" + (ex.getMessage() ?: "") + "</Message></Error>")
    }
    return message
}`,
	},
	{
		name: "OData Pagination Query Builder",
		meta: groovyMeta{
			Description: "Reads a total record count, divides into pages, and builds an XML structure containing $top/$skip query strings for splitting.",
			Complexity:  "Advanced",
			Tags:        []string{"OData", "Routing"},
			SampleProps: "TotalRecordCount: 250\nPageSize: 100\nODataFilter: Status eq 'NEW'",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.MarkupBuilder

def Message processData(Message message) {
    def props      = message.getProperties()
    def totalCount = (props.get("TotalRecordCount") ?: "0").toInteger()
    def pageSize   = (props.get("PageSize")         ?: "100").toInteger()
    def filterExpr = (props.get("ODataFilter")      ?: "") as String

    if (totalCount == 0) {
        message.setBody("<Pages/>")
        message.setProperty("TotalPages", "0")
        return message
    }

    int totalPages = Math.ceil(totalCount / pageSize).toInteger()

    def writer = new StringWriter()
    def xml    = new MarkupBuilder(writer)

    xml.Pages(total: totalPages, records: totalCount, pageSize: pageSize) {
        (0..<totalPages).each { pageIndex ->
            int skip = pageIndex * pageSize
            int top  = (pageIndex == totalPages - 1 && totalCount % pageSize != 0)
                           ? (totalCount % pageSize) : pageSize
            def parts = ['$top=' + top, '$skip=' + skip]
            if (filterExpr) parts.add('$filter=' + filterExpr)
            Page(index: pageIndex + 1) {
                QueryString(parts.join("&"))
                Skip(skip)
                Top(top)
            }
        }
    }

    message.setBody(writer.toString())
    message.setProperty("TotalPages", totalPages.toString())
    return message
}`,
	},
	{
		name: "XML to CSV Conversion",
		meta: groovyMeta{
			Description: "Flattens a structured XML list into a CSV string. Column headers derived from the first item's child element names. Values with separators are auto-quoted.",
			Complexity:  "Intermediate",
			Tags:        []string{"XML", "Conversion"},
			SampleBody:  sampleXMLForCSV,
			SampleProps: "CSVSeparator: ,",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.XmlSlurper

def Message processData(Message message) {
    def props = message.getProperties()
    def sep   = (props.get("CSVSeparator") ?: ",") as String
    def doc   = new XmlSlurper().parseText(message.getBody(String) as String)

    def firstItem = doc.Items.Item[0]
    def columns   = firstItem.children().collect { it.name() }

    def quote = { String val ->
        if (val.contains(sep) || val.contains('"') || val.contains('\n')) {
            '"' + val.replace('"', '""') + '"'
        } else {
            val
        }
    }

    def rows = doc.Items.Item.collect { item ->
        columns.collect { col -> quote(item[col].text()) }.join(sep)
    }

    def csv = ([columns.join(sep)] + rows).join('\n')
    message.setBody(csv)
    message.setHeader("Content-Type",  "text/csv")
    message.setProperty("RowCount",    rows.size().toString())
    message.setProperty("ColumnCount", columns.size().toString())
    return message
}`,
	},
	{
		name: "Filter and Promote Message Attachment",
		meta: groovyMeta{
			Description: "Iterates MIME attachments, finds the first whose filename matches a pattern, and promotes its content to the main message body.",
			Complexity:  "Intermediate",
			Tags:        []string{"Attachments"},
			SampleProps: "AttachmentNamePattern: invoice",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def props   = message.getProperties()
    def pattern = (props.get("AttachmentNamePattern") ?: "invoice").toString().toLowerCase()

    def attachments = message.getAttachments()
    if (!attachments) throw new Exception("No attachments found on this message")

    def mpl = messageLogFactory.getMessageLog(message)
    attachments.each { name, dh -> mpl?.setStringProperty("Attachment_" + name, dh.getContentType()) }

    def match = attachments.find { name, _ -> name?.toLowerCase()?.contains(pattern) }

    if (!match) {
        def available = attachments.keySet().join(", ")
        throw new Exception("No attachment matching '" + pattern + "' found. Available: [" + available + "]")
    }

    message.setBody(match.value.getContent())
    message.setHeader("AttachmentName",        match.key)
    message.setHeader("AttachmentContentType", match.value.getContentType())
    message.setProperty("AttachmentMatched",   match.key)
    return message
}`,
	},
	{
		name: "IDoc Long Text — 132-character TDLINE Segmentation",
		meta: groovyMeta{
			Description: "Splits a long free-form text string into 132-character segments, each wrapped in E1EDKT2/TDLINE, respecting word boundaries.",
			Complexity:  "Advanced",
			Tags:        []string{"IDoc"},
			SampleBody:  sampleIDocLongtext,
			SampleHdrs:  "Content-Type: application/xml",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.XmlSlurper
import groovy.xml.MarkupBuilder

def Message processData(Message message) {
    def doc      = new XmlSlurper().parseText(message.getBody(String) as String)
    def longText = doc.IDOC.E1EDKT1.TDLINE.text()?.trim() ?: ""
    int maxLen   = 132

    if (!longText) {
        message.setBody("<E1EDKT2Lines/>")
        message.setProperty("TDLineCount", "0")
        return message
    }

    def chunks    = []
    def remaining = longText

    while (remaining.length() > maxLen) {
        int splitAt = remaining.lastIndexOf(' ', maxLen)
        if (splitAt <= 0) splitAt = maxLen
        chunks << remaining.substring(0, splitAt).trim()
        remaining = remaining.substring(splitAt).trim()
    }
    if (remaining) chunks << remaining

    def writer  = new StringWriter()
    def builder = new MarkupBuilder(writer)

    builder.E1EDKT2Lines {
        chunks.each { chunk ->
            E1EDKT2 {
                TDFORMAT("  ")
                TDLINE(chunk)
            }
        }
    }

    message.setBody(writer.toString())
    message.setProperty("TDLineCount",    chunks.size().toString())
    message.setProperty("OriginalLength", longText.length().toString())
    return message
}`,
	},
	{
		name: "Quantity Incrementer — Payload Mutation Demo",
		meta: groovyMeta{
			Description: "Parses XML body, finds all <Quantity> elements, increments each value by 1, writes the mutated XML back as the message body. Adds X-Processed-By and X-Quantity-Incremented headers. Used in the end-to-end toolkit test journey (HTTP→HTTP Groovy iFlow scenario).",
			Complexity:  "Beginner",
			Tags:        []string{"Transform", "XML", "Demo"},
			SampleBody: `<?xml version="1.0" encoding="UTF-8"?>
<Order>
  <OrderNumber>ORD-001</OrderNumber>
  <Items>
    <Item>
      <ProductID>WIDGET-A</ProductID>
      <Quantity>5</Quantity>
      <UnitPrice>12.99</UnitPrice>
    </Item>
    <Item>
      <ProductID>GADGET-B</ProductID>
      <Quantity>2</Quantity>
      <UnitPrice>49.95</UnitPrice>
    </Item>
  </Items>
</Order>`,
			SampleHdrs: "Content-Type: application/xml",
			Builtin:    true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message
import groovy.xml.XmlUtil

def Message processData(Message message) {
    def body = message.getBody(String.class)

    // Parse XML, increment every <Quantity> element
    def root = new XmlSlurper(false, false).parseText(body)
    def incremented = 0
    root.'**'.findAll { it.name() == 'Quantity' }.each { node ->
        def val = node.text().trim()
        if (val.isInteger()) {
            node.replaceBody((val.toInteger() + 1).toString())
            incremented++
        }
    }

    // Write mutated XML back as message body
    message.setBody(XmlUtil.serialize(root))

    // Trace headers
    message.setHeader('X-Processed-By',          'CPI-Toolkit-Groovy')
    message.setHeader('X-Quantity-Incremented',   incremented.toString())
    message.setHeader('X-Processed-At',           new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone('UTC')))

    return message
}`,
	},
	{
		name: "Evaluate Conditions and Set Routing Properties",
		meta: groovyMeta{
			Description: "Inspects the message body and headers to classify the document type, then sets typed exchange properties for a downstream Router step.",
			Complexity:  "Beginner",
			Tags:        []string{"Routing"},
			SampleBody:  sampleFIPostingXML,
			SampleHdrs:  "Content-Type: application/xml\nSenderSystemID: S4H-CLNT100\nSAP_MessageProcessingLogID: MPL-IDE-2026-001",
			Builtin:     true,
		},
		body: `import com.sap.gateway.ip.core.customdev.util.Message

def Message processData(Message message) {
    def body    = message.getBody(String) as String
    def headers = message.getHeaders()
    def props   = message.getProperties()

    def senderSystem = headers.get("SenderSystemID")
                    ?: props.get("SAPSenderSystem")
                    ?: "UNKNOWN"

    String routingKey
    if      (body.contains("<DocumentType>KR</DocumentType>")) routingKey = "VENDOR_INVOICE"
    else if (body.contains("<DocumentType>KG</DocumentType>")) routingKey = "VENDOR_CREDIT"
    else if (body.contains("<DocumentType>DR</DocumentType>")) routingKey = "CUSTOMER_INVOICE"
    else if (body.contains("<DocumentType>DG</DocumentType>")) routingKey = "CUSTOMER_CREDIT"
    else                                                        routingKey = "STANDARD"

    message.setProperty("RoutingKey",    routingKey)
    message.setProperty("SenderSystem",  senderSystem)
    message.setProperty("IsCredit",      routingKey.endsWith("CREDIT").toString())
    message.setProperty("ProcessingDate",
        new java.text.SimpleDateFormat("yyyyMMdd").format(new Date()))
    def tsFmt = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'")
    tsFmt.setTimeZone(TimeZone.getTimeZone("UTC"))
    message.setProperty("ProcessingTS", tsFmt.format(new Date()))
    return message
}`,
	},
}
