package sapclient

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"
)

// MessageStatus is the processing status of a CPI message.
type MessageStatus string

const (
	StatusCompleted  MessageStatus = "COMPLETED"
	StatusFailed     MessageStatus = "FAILED"
	StatusProcessing MessageStatus = "PROCESSING"
	StatusRetry      MessageStatus = "RETRY"
	StatusEscalated  MessageStatus = "ESCALATED"
	StatusAbandoned  MessageStatus = "ABANDONED"
	StatusDiscarded  MessageStatus = "DISCARDED"
)

// IntegrationArtifact holds the iFlow and package details embedded in a message log.
type IntegrationArtifact struct {
	ID          string `json:"Id"`
	Name        string `json:"Name"`
	Type        string `json:"Type"`
	PackageID   string `json:"PackageId"`
	PackageName string `json:"PackageName"`
}

// Message represents a CPI MessageProcessingLog entry.
type Message struct {
	MessageGUID         string               `json:"MessageGuid"`
	CorrelationID       string               `json:"CorrelationId"`
	AppMessageID        string               `json:"ApplicationMessageId"`
	AppMessageType      string               `json:"ApplicationMessageType"`
	LogStart            string               `json:"LogStart"` // SAP OData date: /Date(ms)/
	LogEnd              string               `json:"LogEnd"`
	IntegrationFlow     string               `json:"IntegrationFlowName"`
	IntegrationArtifact *IntegrationArtifact `json:"IntegrationArtifact"`
	Status              MessageStatus        `json:"Status"`
	CustomStatus        string               `json:"CustomStatus"`
	TransactionID       string               `json:"TransactionId"`
}

// MessageDetail extends Message with error information.
type MessageDetail struct {
	Message
	ErrorInformation *ErrorInfo
}

// ErrorInfo holds the error text for a failed message.
type ErrorInfo struct {
	Type string `json:"Type"`
	Last string `json:"LastErrorMessage"`
}

// ListMessagesParams configures a ListMessages query.
type ListMessagesParams struct {
	Top    int
	Skip   int
	Filter string        // raw OData $filter — appended to Status filter if both set
	Status MessageStatus // convenience shorthand
}

// ListMessages queries the MessageProcessingLogs OData feed.
func (c *Client) ListMessages(ctx context.Context, p ListMessagesParams) ([]Message, error) {
	q := url.Values{"$format": {"json"}, "$orderby": {"LogStart desc"}}
	if p.Top > 0 {
		q.Set("$top", fmt.Sprintf("%d", p.Top))
	}
	if p.Skip > 0 {
		q.Set("$skip", fmt.Sprintf("%d", p.Skip))
	}

	parts := []string{}
	if p.Status != "" {
		parts = append(parts, fmt.Sprintf("Status eq '%s'", p.Status))
	}
	if p.Filter != "" {
		parts = append(parts, p.Filter)
	}
	if len(parts) > 0 {
		q.Set("$filter", strings.Join(parts, " and "))
	}

	resp, err := c.Do(ctx, CategoryMonitoring, "GET",
		"/api/v1/MessageProcessingLogs?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("SAP %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		D struct {
			Results []Message `json:"results"`
		} `json:"d"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode messages: %w", err)
	}
	return result.D.Results, nil
}

// CountMessages returns the total count matching the OData filter.
func (c *Client) CountMessages(ctx context.Context, filter string) (int, error) {
	path := "/api/v1/MessageProcessingLogs/$count"
	if filter != "" {
		path += "?" + url.Values{"$filter": {filter}}.Encode()
	}
	resp, err := c.Do(ctx, CategoryMonitoring, "GET", path, nil)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return 0, fmt.Errorf("SAP %d", resp.StatusCode)
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}
	var n int
	if _, err := fmt.Sscanf(strings.TrimSpace(string(b)), "%d", &n); err != nil {
		return 0, fmt.Errorf("parse count %q: %w", string(b), err)
	}
	return n, nil
}

// GetMessage returns the detail for a single message by GUID.
func (c *Client) GetMessage(ctx context.Context, guid string) (*Message, error) {
	path := fmt.Sprintf("/api/v1/MessageProcessingLogs('%s')?$format=json",
		url.PathEscape(guid))
	resp, err := c.Do(ctx, CategoryMonitoring, "GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil, fmt.Errorf("message not found: %s", guid)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("SAP %d", resp.StatusCode)
	}
	var result struct {
		D Message `json:"d"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode message: %w", err)
	}
	return &result.D, nil
}

// MessagePage holds a page of messages and the total count from $inlinecount.
type MessagePage struct {
	Messages []Message `json:"messages"`
	Total    int       `json:"total"`
}

// ListMessagePage is like ListMessages but uses $inlinecount=allpages to also return the total.
func (c *Client) ListMessagePage(ctx context.Context, p ListMessagesParams) (*MessagePage, error) {
	q := url.Values{
		"$format":       {"json"},
		"$orderby":      {"LogStart desc"},
		"$inlinecount":  {"allpages"},
	}
	if p.Top > 0 {
		q.Set("$top", fmt.Sprintf("%d", p.Top))
	}
	if p.Skip > 0 {
		q.Set("$skip", fmt.Sprintf("%d", p.Skip))
	}
	parts := []string{}
	if p.Status != "" {
		parts = append(parts, fmt.Sprintf("Status eq '%s'", p.Status))
	}
	if p.Filter != "" {
		parts = append(parts, p.Filter)
	}
	if len(parts) > 0 {
		q.Set("$filter", strings.Join(parts, " and "))
	}

	resp, err := c.Do(ctx, CategoryMonitoring, "GET",
		"/api/v1/MessageProcessingLogs?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("SAP %d: %s", resp.StatusCode, string(b))
	}

	var result struct {
		D struct {
			Count   string    `json:"__count"`
			Results []Message `json:"results"`
		} `json:"d"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode message page: %w", err)
	}
	total, _ := strconv.Atoi(result.D.Count)
	msgs := result.D.Results
	if msgs == nil {
		msgs = []Message{}
	}
	return &MessagePage{Messages: msgs, Total: total}, nil
}

// GetMessageErrorInfo returns the error text for a failed message.
func (c *Client) GetMessageErrorInfo(ctx context.Context, guid string) (*ErrorInfo, error) {
	path := fmt.Sprintf("/api/v1/MessageProcessingLogs('%s')/ErrorInformation?$format=json",
		url.PathEscape(guid))
	resp, err := c.Do(ctx, CategoryMonitoring, "GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return nil, nil // no error info — message may not be failed
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("SAP %d", resp.StatusCode)
	}
	var result struct {
		D ErrorInfo `json:"d"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode error info: %w", err)
	}
	return &result.D, nil
}
