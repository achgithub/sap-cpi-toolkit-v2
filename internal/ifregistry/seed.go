package ifregistry

import (
	"fmt"
	"math/rand"
	"net/http"
)

// seedDemo inserts 30 systems and 200 interfaces into the given project.
// One-off dev tool — remove this file once the load test is done.

var seedSystemNames = []string{
	"SAP S/4HANA", "SAP ERP Central", "Salesforce CRM", "SAP Ariba",
	"SAP SuccessFactors", "Workday HCM", "ServiceNow ITSM", "SAP WM",
	"Microsoft Dynamics", "Oracle EBS", "SAP MDM", "SAP BW/4HANA",
	"Hybris Commerce", "SAP CPQ", "SAP TM", "SAP EWM",
	"EDI Partner A", "EDI Partner B", "EDI Partner C", "EDI Partner D",
	"Internal Data Lake", "PostgreSQL DWH", "MongoDB Store", "SAP HANA DB",
	"Azure Service Bus", "AWS SQS Queue", "MuleSoft Runtime", "SAP BTP Hub",
	"Shopify", "SAP Fieldglass",
}

var seedSystemTypes = []string{
	"SAP S/4HANA", "SAP ERP", "SAP ERP", "SAP BTP",
	"SAP BTP", "Internal System", "Internal System", "Salesforce",
	"Custom", "Custom", "SAP S/4HANA", "SAP S/4HANA",
	"Salesforce", "SAP S/4HANA", "SAP S/4HANA", "SAP S/4HANA",
	"External Partner", "External Partner", "External Partner", "External Partner",
	"Database", "Database", "Database", "Database",
	"Custom", "Custom", "Custom", "SAP BTP",
	"External Partner", "External Partner",
}

var seedInfraTypes   = []string{"AWS", "Azure", "GCP", "On-Prem", "SAP BTP", "On-Prem", ""}
var seedInfraRegions = []string{"eu-west-1", "West Europe", "London", "us-east-1", "eu-central-1", "Frankfurt", ""}
var seedPlatforms    = []string{"SAP CPI", "SAP CPI", "SAP CPI", "MuleSoft", "Azure Integration Services", "SAP PI/PO", "Direct API"}
var seedIfaceTypes   = []string{"point_to_point", "point_to_point", "point_to_point", "point_to_point", "broadcast", "broadcast", "shared_library"}
var seedStatuses     = []string{"design", "dev", "dev", "test", "active", "active", "active", "active", "deprecated"}
var seedTransports   = []string{"HTTP", "HTTP", "SFTP", "RFC", "IDoc", "AS2", "JDBC", ""}
var seedAuthTypes    = []string{"Basic", "OAuth2", "OAuth2", "ClientCert", "None", ""}

var seedVerbs = []string{"Sync", "Transfer", "Distribution", "Integration", "Feed", "Export", "Import", "Replication"}

func (h *Handler) seedDemo(w http.ResponseWriter, r *http.Request) {
	pid := r.PathValue("pid")
	ctx := r.Context()

	// ── Create 30 systems ─────────────────────────────────────────────────────
	sysIDs := make([]string, 0, 30)
	for i, name := range seedSystemNames {
		stype  := seedSystemTypes[i]
		infra  := seedInfraTypes[i%len(seedInfraTypes)]
		region := ""
		if infra != "" {
			region = seedInfraRegions[i%len(seedInfraRegions)]
		}
		var id string
		if err := h.pool.QueryRow(ctx,
			`INSERT INTO systems (project_id, name, description, system_type, infra_type, infra_region)
			 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			pid, name, "Demo-seeded system", stype, infra, region,
		).Scan(&id); err == nil {
			sysIDs = append(sysIDs, id)
		}
	}

	if len(sysIDs) < 2 {
		apiError(w, 500, "failed to create systems")
		return
	}

	// ── Create 200 interfaces ─────────────────────────────────────────────────
	created := 0
	for i := 0; i < 200; i++ {
		ref      := fmt.Sprintf("IF%03d", i+1)
		senderIdx := rand.Intn(len(sysIDs))
		senderID  := sysIDs[senderIdx]

		ifType    := seedIfaceTypes[rand.Intn(len(seedIfaceTypes))]
		status    := seedStatuses[rand.Intn(len(seedStatuses))]
		platform  := seedPlatforms[rand.Intn(len(seedPlatforms))]
		transport := seedTransports[rand.Intn(len(seedTransports))]
		auth      := seedAuthTypes[rand.Intn(len(seedAuthTypes))]

		// Pick a receiver (different from sender)
		recvIdx := (senderIdx + 1 + rand.Intn(len(sysIDs)-1)) % len(sysIDs)
		verb    := seedVerbs[rand.Intn(len(seedVerbs))]
		name    := fmt.Sprintf("%s %s %d",
			seedSystemNames[senderIdx%len(seedSystemNames)], verb, i+1)

		var ifaceID string
		err := h.pool.QueryRow(ctx,
			`INSERT INTO interfaces
			 (project_id, name, interface_type, status, sender_system_id,
			  interface_ref, integration_platform, transport, auth_type, meta)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}') RETURNING id`,
			pid, name, ifType, status, senderID,
			ref, platform, transport, auth,
		).Scan(&ifaceID)
		if err != nil || ifaceID == "" {
			continue
		}

		// Broadcast → 2-4 receivers, P2P → 1 receiver
		numRecv := 1
		if ifType == "broadcast" {
			numRecv = 2 + rand.Intn(3)
		}
		used := map[int]bool{senderIdx: true}
		for ri := 0; ri < numRecv; ri++ {
			candidate := recvIdx
			for used[candidate] {
				candidate = rand.Intn(len(sysIDs))
			}
			used[candidate] = true
			h.pool.Exec(ctx, //nolint:errcheck
				`INSERT INTO interface_receivers (interface_id, system_id, meta) VALUES ($1,$2,'{}')`,
				ifaceID, sysIDs[candidate],
			)
		}
		created++
	}

	jsonResp(w, 200, map[string]any{
		"systems":    len(sysIDs),
		"interfaces": created,
	})
}
