package api

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	sftpPreviewLimit = 256 * 1024 // 256 KB
	sftpUploadLimit  = 64 << 20   // 64 MB
)

type sftpEntry struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	Type        string    `json:"type"` // "file" | "dir"
	Size        int64     `json:"size"`
	ModTime     time.Time `json:"mod_time"`
	Permissions uint32    `json:"permissions"`
}

// realPath resolves a client-supplied path (absolute within the SFTP jail)
// to a real filesystem path, rejecting traversal outside the root.
func (h *Handler) realPath(clientPath string) (string, error) {
	if h.sftpDataDir == "" {
		return "", fmt.Errorf("SFTP_DATA_DIR not configured")
	}
	root := filepath.Clean(h.sftpDataDir)
	abs := filepath.Join(root, filepath.Clean("/"+clientPath))
	if abs != root && !strings.HasPrefix(abs, root+string(filepath.Separator)) {
		return "", fmt.Errorf("path outside SFTP root")
	}
	return abs, nil
}

func (h *Handler) sftpListFiles(w http.ResponseWriter, r *http.Request) {
	clientPath := r.URL.Query().Get("path")
	if clientPath == "" {
		clientPath = "/"
	}
	real, err := h.realPath(clientPath)
	if err != nil {
		apiError(w, 400, err.Error())
		return
	}
	if err := os.MkdirAll(real, 0755); err != nil {
		apiError(w, 500, "cannot create directory")
		return
	}
	entries, err := os.ReadDir(real)
	if err != nil {
		apiError(w, 500, "cannot read directory")
		return
	}
	result := make([]sftpEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		entType := "file"
		if e.IsDir() {
			entType = "dir"
		}
		name := e.Name()
		entPath := clientPath
		if entPath == "/" {
			entPath = "/" + name
		} else {
			entPath = entPath + "/" + name
		}
		result = append(result, sftpEntry{
			Name:        name,
			Path:        entPath,
			Type:        entType,
			Size:        info.Size(),
			ModTime:     info.ModTime(),
			Permissions: uint32(info.Mode()),
		})
	}
	jsonResp(w, 200, result)
}

func (h *Handler) sftpReadFile(w http.ResponseWriter, r *http.Request) {
	clientPath := r.URL.Query().Get("path")
	real, err := h.realPath(clientPath)
	if err != nil {
		apiError(w, 400, err.Error())
		return
	}
	f, err := os.Open(real)
	if err != nil {
		apiError(w, 404, "file not found")
		return
	}
	defer f.Close()

	buf := make([]byte, sftpPreviewLimit+1)
	n, err := io.ReadFull(f, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		apiError(w, 500, "read error")
		return
	}
	truncated := n > sftpPreviewLimit
	if truncated {
		n = sftpPreviewLimit
	}
	jsonResp(w, 200, map[string]any{
		"content":   string(buf[:n]),
		"truncated": truncated,
	})
}

func (h *Handler) sftpCreateFile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	real, err := h.realPath(body.Path)
	if err != nil {
		apiError(w, 400, err.Error())
		return
	}
	if err := os.MkdirAll(filepath.Dir(real), 0755); err != nil {
		apiError(w, 500, "cannot create parent directory")
		return
	}
	if err := os.WriteFile(real, []byte(body.Content), 0644); err != nil {
		apiError(w, 500, "cannot write file")
		return
	}
	w.WriteHeader(201)
}

func (h *Handler) sftpMkdir(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	real, err := h.realPath(body.Path)
	if err != nil {
		apiError(w, 400, err.Error())
		return
	}
	if err := os.MkdirAll(real, 0755); err != nil {
		apiError(w, 500, "cannot create directory")
		return
	}
	w.WriteHeader(201)
}

func (h *Handler) sftpDeleteEntry(w http.ResponseWriter, r *http.Request) {
	clientPath := r.URL.Query().Get("path")
	real, err := h.realPath(clientPath)
	if err != nil {
		apiError(w, 400, err.Error())
		return
	}
	if err := os.RemoveAll(real); err != nil {
		apiError(w, 500, "cannot delete")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) sftpUpload(w http.ResponseWriter, r *http.Request) {
	targetPath := r.URL.Query().Get("path")
	if targetPath == "" {
		targetPath = "/"
	}
	realDir, err := h.realPath(targetPath)
	if err != nil {
		apiError(w, 400, err.Error())
		return
	}
	if err := os.MkdirAll(realDir, 0755); err != nil {
		apiError(w, 500, "cannot create directory")
		return
	}
	if err := r.ParseMultipartForm(sftpUploadLimit); err != nil {
		apiError(w, 400, "multipart parse error: "+err.Error())
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		apiError(w, 400, "no files in request")
		return
	}
	for _, fh := range files {
		src, err := fh.Open()
		if err != nil {
			apiError(w, 500, "cannot open uploaded file")
			return
		}
		dest, err := os.OpenFile(filepath.Join(realDir, filepath.Base(fh.Filename)), os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			src.Close()
			apiError(w, 500, "cannot create file")
			return
		}
		_, copyErr := io.Copy(dest, src)
		src.Close()
		dest.Close()
		if copyErr != nil {
			apiError(w, 500, "write error")
			return
		}
	}
	jsonResp(w, 200, map[string]int{"uploaded": len(files)})
}

func (h *Handler) sftpMove(w http.ResponseWriter, r *http.Request) {
	var body struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if err := decode(r, &body); err != nil {
		apiError(w, 400, "invalid request body")
		return
	}
	from, err := h.realPath(body.From)
	if err != nil {
		apiError(w, 400, "invalid from path: "+err.Error())
		return
	}
	to, err := h.realPath(body.To)
	if err != nil {
		apiError(w, 400, "invalid to path: "+err.Error())
		return
	}
	if err := os.MkdirAll(filepath.Dir(to), 0755); err != nil {
		apiError(w, 500, "cannot create target directory")
		return
	}
	if err := os.Rename(from, to); err != nil {
		apiError(w, 500, "move failed: "+err.Error())
		return
	}
	w.WriteHeader(204)
}
