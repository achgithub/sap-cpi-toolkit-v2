package api

import (
	"bytes"
	"fmt"
	"strings"
	texttemplate "text/template"
)

// scaffoldTmplData is passed to every XML fragment template.
type scaffoldTmplData struct {
	AllowedHeaders         string
	SFIn                   string
	SFOut                  string
	GroovyName             string
	XSLTName               string
	SourceRef              string
	HTTPSUrlPath           string
	SFTPSenderHost         string
	SFTPSenderCredential   string
	SFTPSenderDirectory    string
	SFTPSenderScheduleXML  string
	HTTPReceiverURL        string
	HTTPReceiverCredential string
	SFTPReceiverHost       string
	SFTPReceiverPrivateKey string
	SFTPReceiverUsername   string
	SFTPReceiverDirectory  string
}

var scaffoldDefaultTemplates = map[string]string{

	"collaboration_ext": `        <bpmn2:extensionElements>
            <ifl:property><key>namespaceMapping</key><value/></ifl:property>
            <ifl:property><key>allowedHeaderList</key><value>{{.AllowedHeaders}}</value></ifl:property>
            <ifl:property><key>httpSessionHandling</key><value>None</value></ifl:property>
            <ifl:property><key>ServerTrace</key><value>false</value></ifl:property>
            <ifl:property><key>returnExceptionToSender</key><value>false</value></ifl:property>
            <ifl:property><key>log</key><value>All events</value></ifl:property>
            <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
            <ifl:property><key>cmdVariantUri</key><value>ctype::IFlowVariant/cname::IFlowConfiguration/version::1.1.16</value></ifl:property>
        </bpmn2:extensionElements>`,

	"sender_participant_HTTPS": `
        <bpmn2:participant id="Participant_Sender" ifl:type="EndpointSender" name="Sender1">
            <bpmn2:extensionElements>
                <ifl:property><key>enableBasicAuthentication</key><value>false</value></ifl:property>
                <ifl:property><key>ifl:type</key><value>EndpointSender</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>`,

	"sender_participant_SFTP": `
        <bpmn2:participant id="Participant_Sender" ifl:type="IflSender" name="Sender1">
            <bpmn2:extensionElements>
                <ifl:property><key>ifl:type</key><value>IflSender</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>`,

	"receiver_participant_HTTP": `
        <bpmn2:participant id="Participant_Receiver" ifl:type="EndpointRecevier" name="Receiver1">
            <bpmn2:extensionElements>
                <ifl:property><key>ifl:type</key><value>EndpointRecevier</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>`,

	"receiver_participant_SFTP": `
        <bpmn2:participant id="Participant_Receiver" ifl:type="EndpointRecevier" name="Receiver1">
            <bpmn2:extensionElements>
                <ifl:property><key>ifl:type</key><value>EndpointRecevier</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:participant>`,

	"sender_messageflow_HTTPS": `
        <bpmn2:messageFlow id="MessageFlow_Sender" name="HTTPS"
            sourceRef="Participant_Sender" targetRef="StartEvent_1">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.5</value></ifl:property>
                <ifl:property><key>Name</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>system</key><value>Sender1</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>urlPath</key><value>{{.HTTPSUrlPath}}</value></ifl:property>
                <ifl:property><key>senderAuthType</key><value>RoleBased</value></ifl:property>
                <ifl:property><key>userRole</key><value>ESBMessaging.send</value></ifl:property>
                <ifl:property><key>xsrfProtection</key><value>1</value></ifl:property>
                <ifl:property><key>maximumBodySize</key><value>40</value></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>HTTPS</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>None</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.5.2</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.5.2</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.5.2</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:HTTPS/tp::HTTPS/mp::None/direction::Sender/version::1.5.2</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>`,

	"sender_messageflow_SFTP": `
        <bpmn2:messageFlow id="MessageFlow_Sender" name="SFTP"
            sourceRef="Participant_Sender" targetRef="StartEvent_1">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>SFTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.20</value></ifl:property>
                <ifl:property><key>Name</key><value>SFTP</value></ifl:property>
                <ifl:property><key>system</key><value>Sender1</value></ifl:property>
                <ifl:property><key>direction</key><value>Sender</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>host</key><value>{{.SFTPSenderHost}}</value></ifl:property>
                <ifl:property><key>authentication</key><value>user_password</value></ifl:property>
                <ifl:property><key>credential_name</key><value>{{.SFTPSenderCredential}}</value></ifl:property>
                <ifl:property><key>username</key><value/></ifl:property>
                <ifl:property><key>privateKeyAlias</key><value/></ifl:property>
                <ifl:property><key>connectTimeout</key><value>10000</value></ifl:property>
                <ifl:property><key>maximumReconnectAttempts</key><value>3</value></ifl:property>
                <ifl:property><key>reconnectDelay</key><value>1000</value></ifl:property>
                <ifl:property><key>path</key><value>{{.SFTPSenderDirectory}}</value></ifl:property>
                <ifl:property><key>fileName</key><value>*</value></ifl:property>
                <ifl:property><key>regex_filter</key><value>0</value></ifl:property>
                <ifl:property><key>recursive</key><value>0</value></ifl:property>
                <ifl:property><key>stepwise</key><value>0</value></ifl:property>
                <ifl:property><key>flatten</key><value/></ifl:property>
                <ifl:property><key>noop</key><value>delete</value></ifl:property>
                <ifl:property><key>file.move</key><value>.archive</value></ifl:property>
                <ifl:property><key>doneFileName</key><value>${file:name}.done</value></ifl:property>
                <ifl:property><key>scheduleKey</key><value>{{.SFTPSenderScheduleXML}}</value></ifl:property>
                <ifl:property><key>maxMessagesPerPoll</key><value>20</value></ifl:property>
                <ifl:property><key>maximumFileSize</key><value>40</value></ifl:property>
                <ifl:property><key>disconnect</key><value>1</value></ifl:property>
                <ifl:property><key>readLock</key><value>none</value></ifl:property>
                <ifl:property><key>idempotentRepository</key><value>database</value></ifl:property>
                <ifl:property><key>emptyFileHandling</key><value>processFile</value></ifl:property>
                <ifl:property><key>stopOnException</key><value>1</value></ifl:property>
                <ifl:property><key>useClusterLock</key><value>0</value></ifl:property>
                <ifl:property><key>fastExistsCheck</key><value>1</value></ifl:property>
                <ifl:property><key>allowDeprecatedAlgorithms</key><value>0</value></ifl:property>
                <ifl:property><key>location_id</key><value/></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>SFTP</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>File</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.20.1</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.20.1</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.20.1</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:SFTP/tp::SFTP/mp::File/direction::Sender/version::1.20.1</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>`,

	"receiver_messageflow_HTTP": `
        <bpmn2:messageFlow id="MessageFlow_Receiver" name="HTTP"
            sourceRef="{{.SourceRef}}" targetRef="Participant_Receiver">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>HTTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.17</value></ifl:property>
                <ifl:property><key>Name</key><value>HTTP</value></ifl:property>
                <ifl:property><key>system</key><value>Receiver1</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>httpAddressWithoutQuery</key><value>{{.HTTPReceiverURL}}</value></ifl:property>
                <ifl:property><key>httpMethod</key><value>POST</value></ifl:property>
                <ifl:property><key>authenticationMethod</key><value>Client Certificate</value></ifl:property>
                <ifl:property><key>credentialName</key><value>{{.HTTPReceiverCredential}}</value></ifl:property>
                <ifl:property><key>privateKeyAlias</key><value/></ifl:property>
                <ifl:property><key>httpRequestTimeout</key><value>60000</value></ifl:property>
                <ifl:property><key>throwExceptionOnFailure</key><value>true</value></ifl:property>
                <ifl:property><key>httpShouldSendBody</key><value>false</value></ifl:property>
                <ifl:property><key>allowedResponseHeaders</key><value>*</value></ifl:property>
                <ifl:property><key>allowedRequestHeaders</key><value/></ifl:property>
                <ifl:property><key>enableMPLAttachments</key><value>true</value></ifl:property>
                <ifl:property><key>streaming</key><value>false</value></ifl:property>
                <ifl:property><key>proxyType</key><value>default</value></ifl:property>
                <ifl:property><key>locationID</key><value/></ifl:property>
                <ifl:property><key>proxyHost</key><value/></ifl:property>
                <ifl:property><key>proxyPort</key><value/></ifl:property>
                <ifl:property><key>internetProxyType</key><value/></ifl:property>
                <ifl:property><key>httpAddressQuery</key><value/></ifl:property>
                <ifl:property><key>retryOnConnectionFailure</key><value>false</value></ifl:property>
                <ifl:property><key>retryIteration</key><value>1</value></ifl:property>
                <ifl:property><key>retryInterval</key><value>5</value></ifl:property>
                <ifl:property><key>direction</key><value>Receiver</value></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>HTTP</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>None</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.17.0</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.17.0</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.17.0</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:HTTP/tp::HTTP/mp::None/direction::Receiver/version::1.17.0</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>`,

	"receiver_messageflow_SFTP": `
        <bpmn2:messageFlow id="MessageFlow_Receiver" name="SFTP"
            sourceRef="{{.SourceRef}}" targetRef="Participant_Receiver">
            <bpmn2:extensionElements>
                <ifl:property><key>ComponentType</key><value>SFTP</value></ifl:property>
                <ifl:property><key>ComponentNS</key><value>sap</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.13</value></ifl:property>
                <ifl:property><key>Name</key><value>SFTP</value></ifl:property>
                <ifl:property><key>system</key><value>Receiver1</value></ifl:property>
                <ifl:property><key>direction</key><value>Receiver</value></ifl:property>
                <ifl:property><key>Description</key><value/></ifl:property>
                <ifl:property><key>host</key><value>{{.SFTPReceiverHost}}</value></ifl:property>
                <ifl:property><key>authentication</key><value>public_key</value></ifl:property>
                <ifl:property><key>privateKeyAlias</key><value>{{.SFTPReceiverPrivateKey}}</value></ifl:property>
                <ifl:property><key>username</key><value>{{.SFTPReceiverUsername}}</value></ifl:property>
                <ifl:property><key>credential_name</key><value/></ifl:property>
                <ifl:property><key>connectTimeout</key><value>10000</value></ifl:property>
                <ifl:property><key>maximumReconnectAttempts</key><value>3</value></ifl:property>
                <ifl:property><key>reconnectDelay</key><value>1000</value></ifl:property>
                <ifl:property><key>path</key><value>{{.SFTPReceiverDirectory}}</value></ifl:property>
                <ifl:property><key>fileName</key><value>${header.CamelFileName}</value></ifl:property>
                <ifl:property><key>fileExist</key><value>Override</value></ifl:property>
                <ifl:property><key>autoCreate</key><value>1</value></ifl:property>
                <ifl:property><key>stepwise</key><value>1</value></ifl:property>
                <ifl:property><key>useTempFile</key><value>0</value></ifl:property>
                <ifl:property><key>disconnect</key><value>1</value></ifl:property>
                <ifl:property><key>maximumFileSize</key><value>40</value></ifl:property>
                <ifl:property><key>fastExistsCheck</key><value>1</value></ifl:property>
                <ifl:property><key>allowDeprecatedAlgorithms</key><value>0</value></ifl:property>
                <ifl:property><key>location_id</key><value/></ifl:property>
                <ifl:property><key>TransportProtocol</key><value>SFTP</value></ifl:property>
                <ifl:property><key>MessageProtocol</key><value>File</value></ifl:property>
                <ifl:property><key>TransportProtocolVersion</key><value>1.13.3</value></ifl:property>
                <ifl:property><key>MessageProtocolVersion</key><value>1.13.3</value></ifl:property>
                <ifl:property><key>ComponentSWCVName</key><value>external</value></ifl:property>
                <ifl:property><key>ComponentSWCVId</key><value>1.13.3</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::AdapterVariant/cname::sap:SFTP/tp::SFTP/mp::File/direction::Receiver/version::1.13.3</value></ifl:property>
            </bpmn2:extensionElements>
        </bpmn2:messageFlow>`,

	"step_content_modifier": `
        <bpmn2:callActivity id="CallActivity_SetHeaders" name="Set Standard Headers">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Enricher</value></ifl:property>
                <ifl:property><key>bodyType</key><value></value></ifl:property>
                <ifl:property><key>wrapContent</key><value></value></ifl:property>
                <ifl:property>
                    <key>headerTable</key>
                    <value>&lt;row&gt;&lt;cell id='Action'&gt;Create&lt;/cell&gt;&lt;cell id='Type'&gt;expression&lt;/cell&gt;&lt;cell id='Value'&gt;${date:now:yyyyMMddHHmmss}_${exchangeId}&lt;/cell&gt;&lt;cell id='Default'&gt;&lt;/cell&gt;&lt;cell id='Name'&gt;SAP_ApplicationID&lt;/cell&gt;&lt;cell id='Datatype'&gt;java.lang.String&lt;/cell&gt;&lt;/row&gt;</value>
                </ifl:property>
                <ifl:property><key>propertyTable</key><value></value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.6</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::Enricher/version::1.6.1</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>{{.SFIn}}</bpmn2:incoming>
            <bpmn2:outgoing>{{.SFOut}}</bpmn2:outgoing>
        </bpmn2:callActivity>`,

	"step_groovy": `
        <bpmn2:callActivity id="CallActivity_Groovy" name="{{.GroovyName}}">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Script</value></ifl:property>
                <ifl:property><key>subActivityType</key><value>GroovyScript</value></ifl:property>
                <ifl:property><key>script</key><value>{{.GroovyName}}.groovy</value></ifl:property>
                <ifl:property><key>scriptFunction</key><value>processData</value></ifl:property>
                <ifl:property><key>scriptBundleId</key><value/></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::GroovyScript/version::1.1.2</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>{{.SFIn}}</bpmn2:incoming>
            <bpmn2:outgoing>{{.SFOut}}</bpmn2:outgoing>
        </bpmn2:callActivity>`,

	"step_xslt": `
        <bpmn2:callActivity id="CallActivity_XSLT" name="{{.XSLTName}}">
            <bpmn2:extensionElements>
                <ifl:property><key>activityType</key><value>Mapping</value></ifl:property>
                <ifl:property><key>subActivityType</key><value>XSLTMapping</value></ifl:property>
                <ifl:property><key>mappingpath</key><value>src/main/resources/mapping/{{.XSLTName}}.xsl</value></ifl:property>
                <ifl:property><key>mappingoutputformat</key><value>Bytes</value></ifl:property>
                <ifl:property><key>mappingSource</key><value>mappingSrcBody</value></ifl:property>
                <ifl:property><key>componentVersion</key><value>1.2</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::XSLTMapping/version::1.2.0</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>{{.SFIn}}</bpmn2:incoming>
            <bpmn2:outgoing>{{.SFOut}}</bpmn2:outgoing>
        </bpmn2:callActivity>`,

	"step_exception_subprocess": `
        <bpmn2:subProcess id="SubProcess_EH" name="Exception Subprocess 1">
            <bpmn2:extensionElements>
                <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                <ifl:property><key>activityType</key><value>ErrorEventSubProcessTemplate</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::ErrorEventSubProcessTemplate/version::1.1.0</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:startEvent id="ErrorStartEvent_1" name="Error Start 1">
                <bpmn2:outgoing>SequenceFlow_EH1</bpmn2:outgoing>
                <bpmn2:errorEventDefinition>
                    <bpmn2:extensionElements>
                        <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::ErrorStartEvent</value></ifl:property>
                        <ifl:property><key>activityType</key><value>StartErrorEvent</value></ifl:property>
                    </bpmn2:extensionElements>
                </bpmn2:errorEventDefinition>
            </bpmn2:startEvent>
            <bpmn2:callActivity id="CallActivity_EH" name="Handle Error">
                <bpmn2:extensionElements>
                    <ifl:property><key>activityType</key><value>Enricher</value></ifl:property>
                    <ifl:property><key>bodyType</key><value>expression</value></ifl:property>
                    <ifl:property><key>wrapContent</key><value>${exception.message}</value></ifl:property>
                    <ifl:property><key>headerTable</key><value></value></ifl:property>
                    <ifl:property><key>propertyTable</key><value></value></ifl:property>
                    <ifl:property><key>componentVersion</key><value>1.6</value></ifl:property>
                    <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::Enricher/version::1.6.1</value></ifl:property>
                </bpmn2:extensionElements>
                <bpmn2:incoming>SequenceFlow_EH1</bpmn2:incoming>
                <bpmn2:outgoing>SequenceFlow_EH2</bpmn2:outgoing>
            </bpmn2:callActivity>
            <bpmn2:endEvent id="EndEvent_EH" name="End Error">
                <bpmn2:extensionElements>
                    <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                    <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::MessageEndEvent/version::1.1.0</value></ifl:property>
                </bpmn2:extensionElements>
                <bpmn2:incoming>SequenceFlow_EH2</bpmn2:incoming>
                <bpmn2:messageEventDefinition/>
            </bpmn2:endEvent>
            <bpmn2:sequenceFlow id="SequenceFlow_EH1" sourceRef="ErrorStartEvent_1" targetRef="CallActivity_EH"/>
            <bpmn2:sequenceFlow id="SequenceFlow_EH2" sourceRef="CallActivity_EH" targetRef="EndEvent_EH"/>
        </bpmn2:subProcess>`,
}

func renderScaffoldFragment(templates map[string]string, key string, data scaffoldTmplData) string {
	src, ok := templates[key]
	if !ok {
		return fmt.Sprintf("<!-- unknown scaffold fragment: %s -->", key)
	}
	t, err := texttemplate.New("").Parse(src)
	if err != nil {
		return fmt.Sprintf("<!-- template %s parse error: %s -->", key, err)
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return fmt.Sprintf("<!-- template %s render error: %s -->", key, err)
	}
	return buf.String()
}

// generateIFlowXML builds the full BPMN iFlow XML.
func generateIFlowXML(templates map[string]string, req ScaffoldRequest, groovyName, xsltName string) string {
	type flowStep struct{ ID, Name string; X, Y float64 }

	var steps []flowStep
	steps = append(steps, flowStep{"CallActivity_SetHeaders", "Set Standard Headers", 400, 180})
	if req.IncludeGroovy {
		steps = append(steps, flowStep{"CallActivity_Groovy", groovyName, 560, 180})
	}
	if req.IncludeXSLT {
		x := 560.0
		if req.IncludeGroovy {
			x = 720.0
		}
		steps = append(steps, flowStep{"CallActivity_XSLT", xsltName, x, 180})
	}

	lastX := 500.0
	if len(steps) > 0 {
		lastX = steps[len(steps)-1].X + 100
	}
	endEventX := lastX + 70
	receiverParticipantX := endEventX + 130
	poolWidth := receiverParticipantX - 220 + 60
	if poolWidth < 700 {
		poolWidth = 700
	}

	allIDs := []string{"StartEvent_1"}
	for _, s := range steps {
		allIDs = append(allIDs, s.ID)
	}
	allIDs = append(allIDs, "EndEvent_1")

	type sf struct{ id, from, to string }
	var seqFlows []sf
	for i := 1; i < len(allIDs); i++ {
		seqFlows = append(seqFlows, sf{
			id:   fmt.Sprintf("SequenceFlow_%d", i),
			from: allIDs[i-1],
			to:   allIDs[i],
		})
	}
	lastSF := seqFlows[len(seqFlows)-1].id

	allowedHeaders := ""
	if req.SenderAdapter == "SFTP" || req.ReceiverAdapter == "SFTP" {
		allowedHeaders = "CamelFileName"
	}

	base := scaffoldTmplData{
		AllowedHeaders:         allowedHeaders,
		SourceRef:              "EndEvent_1",
		HTTPSUrlPath:           zzDefault(req.HTTPSUrlPath, "ZZURLPATH"),
		SFTPSenderHost:         zzDefault(req.SFTPSenderHost, "ZZHOST"),
		SFTPSenderCredential:   zzDefault(req.SFTPSenderCredential, "ZZCREDENTIALNAME"),
		SFTPSenderDirectory:    zzDefault(req.SFTPSenderDirectory, "ZZDIRECTORY"),
		SFTPSenderScheduleXML:  buildSFTPScheduleXML(req.SFTPSenderScheduleType, req.SFTPSenderScheduleValue),
		HTTPReceiverURL:        zzDefault(req.HTTPReceiverURL, "ZZURL"),
		HTTPReceiverCredential: zzDefault(req.HTTPReceiverCredential, "ZZCREDENTIALNAME"),
		SFTPReceiverHost:       zzDefault(req.SFTPReceiverHost, "ZZHOST"),
		SFTPReceiverPrivateKey: zzDefault(req.SFTPReceiverPrivateKey, "ZZPRIVATEKEYALIAS"),
		SFTPReceiverUsername:   zzDefault(req.SFTPReceiverUsername, "ZZUSERNAME"),
		SFTPReceiverDirectory:  zzDefault(req.SFTPReceiverDirectory, "ZZDIRECTORY"),
	}

	var b strings.Builder

	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions
    xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    xmlns:ifl="http:///com.sap.ifl.model/Ifl.xsd"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    id="Definitions_1">
`)

	b.WriteString("\n    <bpmn2:collaboration id=\"Collaboration_1\" name=\"Default Collaboration\">\n")
	b.WriteString(renderScaffoldFragment(templates, "collaboration_ext", base))
	b.WriteString("\n")
	b.WriteString(renderScaffoldFragment(templates, "sender_participant_"+req.SenderAdapter, base))
	b.WriteString(`
        <bpmn2:participant id="Participant_Process_1" ifl:type="IntegrationProcess"
            name="Integration Process" processRef="Process_1">
            <bpmn2:extensionElements/>
        </bpmn2:participant>
`)
	b.WriteString(renderScaffoldFragment(templates, "receiver_participant_"+req.ReceiverAdapter, base))
	b.WriteString(renderScaffoldFragment(templates, "sender_messageflow_"+req.SenderAdapter, base))
	b.WriteString(renderScaffoldFragment(templates, "receiver_messageflow_"+req.ReceiverAdapter, base))
	b.WriteString("\n    </bpmn2:collaboration>\n")

	b.WriteString(`
    <bpmn2:process id="Process_1" name="Integration Process">
        <bpmn2:extensionElements>
            <ifl:property><key>transactionTimeout</key><value>30</value></ifl:property>
            <ifl:property><key>componentVersion</key><value>1.2</value></ifl:property>
            <ifl:property><key>cmdVariantUri</key><value>ctype::FlowElementVariant/cname::IntegrationProcess/version::1.2.1</value></ifl:property>
            <ifl:property><key>transactionalHandling</key><value>Not Required</value></ifl:property>
        </bpmn2:extensionElements>

        <bpmn2:startEvent id="StartEvent_1" name="Start">
            <bpmn2:extensionElements>
                <ifl:property><key>componentVersion</key><value>1.0</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::MessageStartEvent/version::1.0</value></ifl:property>
                <ifl:property><key>activityType</key><value>StartEvent</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:outgoing>SequenceFlow_1</bpmn2:outgoing>
            <bpmn2:messageEventDefinition/>
        </bpmn2:startEvent>
`)

	cmIdx := scaffoldIndexOf(allIDs, "CallActivity_SetHeaders")
	cmData := base
	cmData.SFIn = seqFlows[cmIdx-1].id
	cmData.SFOut = seqFlows[cmIdx].id
	b.WriteString(renderScaffoldFragment(templates, "step_content_modifier", cmData))

	if req.IncludeGroovy {
		idx := scaffoldIndexOf(allIDs, "CallActivity_Groovy")
		gData := base
		gData.GroovyName = groovyName
		gData.SFIn = seqFlows[idx-1].id
		gData.SFOut = seqFlows[idx].id
		b.WriteString(renderScaffoldFragment(templates, "step_groovy", gData))
	}

	if req.IncludeXSLT {
		idx := scaffoldIndexOf(allIDs, "CallActivity_XSLT")
		xData := base
		xData.XSLTName = xsltName
		xData.SFIn = seqFlows[idx-1].id
		xData.SFOut = seqFlows[idx].id
		b.WriteString(renderScaffoldFragment(templates, "step_xslt", xData))
	}

	fmt.Fprintf(&b, `
        <bpmn2:endEvent id="EndEvent_1" name="End">
            <bpmn2:extensionElements>
                <ifl:property><key>componentVersion</key><value>1.1</value></ifl:property>
                <ifl:property><key>cmdVariantUri</key><value>ctype::FlowstepVariant/cname::MessageEndEvent/version::1.1.0</value></ifl:property>
            </bpmn2:extensionElements>
            <bpmn2:incoming>%s</bpmn2:incoming>
            <bpmn2:messageEventDefinition/>
        </bpmn2:endEvent>
`, lastSF)

	b.WriteString(renderScaffoldFragment(templates, "step_exception_subprocess", base))

	for _, sf := range seqFlows {
		fmt.Fprintf(&b, "        <bpmn2:sequenceFlow id=%q sourceRef=%q targetRef=%q/>\n", sf.id, sf.from, sf.to)
	}
	b.WriteString("    </bpmn2:process>\n")

	fmt.Fprintf(&b, `
    <bpmndi:BPMNDiagram id="BPMNDiagram_1" name="Default Collaboration Diagram">
        <bpmndi:BPMNPlane bpmnElement="Collaboration_1" id="BPMNPlane_1">
            <bpmndi:BPMNShape bpmnElement="Participant_Sender" id="BPMNShape_Participant_Sender">
                <dc:Bounds height="100.0" width="100.0" x="60.0" y="160.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="Participant_Process_1" id="BPMNShape_Participant_Process_1">
                <dc:Bounds height="312.0" width="%.1f" x="220.0" y="110.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="Participant_Receiver" id="BPMNShape_Participant_Receiver">
                <dc:Bounds height="100.0" width="100.0" x="%.1f" y="160.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="StartEvent_1" id="BPMNShape_StartEvent_1">
                <dc:Bounds height="32.0" width="32.0" x="300.0" y="194.0"/>
            </bpmndi:BPMNShape>
`, poolWidth, receiverParticipantX)

	for _, s := range steps {
		fmt.Fprintf(&b,
			"            <bpmndi:BPMNShape bpmnElement=%q id=%q>\n                <dc:Bounds height=\"60.0\" width=\"100.0\" x=\"%.1f\" y=\"%.1f\"/>\n            </bpmndi:BPMNShape>\n",
			s.ID, "BPMNShape_"+s.ID, s.X, s.Y)
	}

	fmt.Fprintf(&b,
		"            <bpmndi:BPMNShape bpmnElement=\"EndEvent_1\" id=\"BPMNShape_EndEvent_1\">\n                <dc:Bounds height=\"32.0\" width=\"32.0\" x=\"%.1f\" y=\"194.0\"/>\n            </bpmndi:BPMNShape>\n",
		endEventX)

	ehX := 400.0
	ehWidth := 350.0
	fmt.Fprintf(&b, `
            <bpmndi:BPMNShape bpmnElement="SubProcess_EH" id="BPMNShape_SubProcess_EH">
                <dc:Bounds height="120.0" width="%.1f" x="%.1f" y="270.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="ErrorStartEvent_1" id="BPMNShape_ErrorStartEvent_1">
                <dc:Bounds height="32.0" width="32.0" x="%.1f" y="304.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="CallActivity_EH" id="BPMNShape_CallActivity_EH">
                <dc:Bounds height="60.0" width="100.0" x="%.1f" y="290.0"/>
            </bpmndi:BPMNShape>
            <bpmndi:BPMNShape bpmnElement="EndEvent_EH" id="BPMNShape_EndEvent_EH">
                <dc:Bounds height="32.0" width="32.0" x="%.1f" y="304.0"/>
            </bpmndi:BPMNShape>
`, ehWidth, ehX, ehX+20, ehX+100, ehX+260)

	stepCentersX := map[string]float64{"StartEvent_1": 316}
	for _, s := range steps {
		stepCentersX[s.ID] = s.X + 50
	}
	stepCentersX["EndEvent_1"] = endEventX + 16

	prevX := 316.0
	for _, sf := range seqFlows {
		toX := stepCentersX[sf.to]
		fmt.Fprintf(&b,
			"            <bpmndi:BPMNEdge bpmnElement=%q id=%q sourceElement=%q targetElement=%q>\n                <di:waypoint x=\"%.1f\" xsi:type=\"dc:Point\" y=\"210.0\"/>\n                <di:waypoint x=\"%.1f\" xsi:type=\"dc:Point\" y=\"210.0\"/>\n            </bpmndi:BPMNEdge>\n",
			sf.id, "BPMNEdge_"+sf.id, "BPMNShape_"+sf.from, "BPMNShape_"+sf.to, prevX, toX-10)
		prevX = toX + 50
	}

	fmt.Fprintf(&b, `
            <bpmndi:BPMNEdge bpmnElement="SequenceFlow_EH1" id="BPMNEdge_SequenceFlow_EH1">
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
            </bpmndi:BPMNEdge>
            <bpmndi:BPMNEdge bpmnElement="SequenceFlow_EH2" id="BPMNEdge_SequenceFlow_EH2">
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="320.0"/>
            </bpmndi:BPMNEdge>
`, ehX+52, ehX+100, ehX+200, ehX+260)

	fmt.Fprintf(&b, `
            <bpmndi:BPMNEdge bpmnElement="MessageFlow_Sender" id="BPMNEdge_MessageFlow_Sender">
                <di:waypoint x="160.0" xsi:type="dc:Point" y="210.0"/>
                <di:waypoint x="300.0" xsi:type="dc:Point" y="210.0"/>
            </bpmndi:BPMNEdge>
            <bpmndi:BPMNEdge bpmnElement="MessageFlow_Receiver" id="BPMNEdge_MessageFlow_Receiver">
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="210.0"/>
                <di:waypoint x="%.1f" xsi:type="dc:Point" y="210.0"/>
            </bpmndi:BPMNEdge>
`, endEventX+32, receiverParticipantX)

	b.WriteString(`        </bpmndi:BPMNPlane>
    </bpmndi:BPMNDiagram>
</bpmn2:definitions>
`)

	return b.String()
}
