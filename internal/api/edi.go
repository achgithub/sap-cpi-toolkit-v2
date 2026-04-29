package api

import (
	"net/http"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/edi"
)

func (h *Handler) ediParse(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := decode(r, &body); err != nil || body.Content == "" {
		apiError(w, 400, "content is required")
		return
	}
	result, err := edi.Parse(body.Content)
	if err != nil {
		apiError(w, 422, err.Error())
		return
	}
	jsonResp(w, 200, result)
}

func (h *Handler) ediToXML(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := decode(r, &body); err != nil || body.Content == "" {
		apiError(w, 400, "content is required")
		return
	}
	result, err := edi.Parse(body.Content)
	if err != nil {
		apiError(w, 422, err.Error())
		return
	}
	xmlStr, err := edi.ToXML(&result)
	if err != nil {
		apiError(w, 500, "conversion failed")
		return
	}
	jsonResp(w, 200, map[string]string{"xml": xmlStr})
}

func (h *Handler) ediToSemanticXML(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := decode(r, &body); err != nil || body.Content == "" {
		apiError(w, 400, "content is required")
		return
	}
	result, err := edi.Parse(body.Content)
	if err != nil {
		apiError(w, 422, err.Error())
		return
	}
	xmlStr, err := edi.ToSemanticXML(&result)
	if err != nil {
		apiError(w, 500, "conversion failed")
		return
	}
	jsonResp(w, 200, map[string]string{"xml": xmlStr})
}

func (h *Handler) ediFromXML(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if err := decode(r, &body); err != nil || body.Content == "" {
		apiError(w, 400, "content is required")
		return
	}
	ediStr, err := edi.FromXML(body.Content)
	if err != nil {
		apiError(w, 422, err.Error())
		return
	}
	jsonResp(w, 200, map[string]string{"edi": ediStr})
}

func (h *Handler) ediGenerate(w http.ResponseWriter, r *http.Request) {
	var req edi.GenerateRequest
	if err := decode(r, &req); err != nil {
		apiError(w, 400, "invalid body")
		return
	}
	if req.Standard == "" || req.MessageType == "" {
		apiError(w, 400, "standard and message_type are required")
		return
	}
	result, err := edi.Generate(req)
	if err != nil {
		apiError(w, 422, err.Error())
		return
	}
	jsonResp(w, 200, map[string]string{"edi": result})
}
