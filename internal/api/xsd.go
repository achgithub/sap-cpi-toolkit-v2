package api

import (
	"net/http"

	"github.com/achgithub/sap-cpi-toolkit-v2/internal/xsd"
)

func (h *Handler) xsdGenerate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Content string `json:"content"`
	}
	if err := decode(r, &req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	res, err := xsd.FromXML(req.Content)
	if err != nil {
		apiError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	jsonResp(w, http.StatusOK, map[string]any{
		"xsd":      res.XSD,
		"warnings": res.Warnings,
	})
}
