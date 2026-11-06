package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// server is an instance of run started by startServer.
type server struct {
	url    string
	cancel context.CancelFunc
	done   chan error
}

// startServer runs the server on a free port with the given environment and
// waits until it is listening.
func startServer(t *testing.T, env map[string]string) *server {
	t.Helper()
	if _, ok := env["PORT"]; !ok {
		env["PORT"] = "0"
	}
	getenv := func(key string) string { return env[key] }

	ctx, cancel := context.WithCancel(context.Background())
	pr, pw := io.Pipe()
	done := make(chan error, 1)
	go func() {
		done <- run(ctx, getenv, pw)
		pw.Close()
	}()

	// Read the JSON log until the "listening" line, then keep draining it so
	// the server never blocks on logging.
	addrCh := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(pr)
		for scanner.Scan() {
			var entry struct {
				Msg  string `json:"msg"`
				Addr string `json:"addr"`
			}
			if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Msg == "server listening" {
				addrCh <- entry.Addr
			}
		}
	}()

	s := &server{cancel: cancel, done: done}
	t.Cleanup(func() {
		cancel()
		<-done
	})

	select {
	case addr := <-addrCh:
		_, port, err := net.SplitHostPort(addr)
		if err != nil {
			t.Fatalf("parse listen address %q: %v", addr, err)
		}
		s.url = "http://" + net.JoinHostPort("127.0.0.1", port)
	case err := <-done:
		t.Fatalf("run returned before listening: %v", err)
	case <-time.After(5 * time.Second):
		t.Fatal("server did not start listening")
	}
	return s
}

// stop cancels the server's context and returns run's result.
func (s *server) stop(t *testing.T) error {
	t.Helper()
	s.cancel()
	select {
	case err := <-s.done:
		s.done <- err // let the cleanup's receive succeed
		return err
	case <-time.After(10 * time.Second):
		t.Fatal("server did not shut down")
		return nil
	}
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return resp.StatusCode, string(body)
}

func TestRunServesAPIAndShutsDownGracefully(t *testing.T) {
	s := startServer(t, map[string]string{})

	if status, body := get(t, s.url+"/healthz"); status != http.StatusOK || !strings.Contains(body, `"ok"`) {
		t.Errorf("GET /healthz = %d %s, want 200 with status ok", status, body)
	}

	resp, err := http.Post(s.url+"/api/v1/calculate", "application/json", strings.NewReader(`{"operation":"add","a":2,"b":3}`))
	if err != nil {
		t.Fatalf("POST calculate: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), `"result":5`) {
		t.Errorf("POST calculate = %d %s, want 200 with result 5", resp.StatusCode, body)
	}

	if err := s.stop(t); err != nil {
		t.Errorf("run returned %v after shutdown, want nil", err)
	}
}

func TestRunServesStaticFiles(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<h1>calculator</h1>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("console.log(1)"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := startServer(t, map[string]string{"STATIC_DIR": dir})

	tests := []struct {
		path       string
		wantStatus int
		wantBody   string
	}{
		{"/", http.StatusOK, "<h1>calculator</h1>"},
		{"/assets/app.js", http.StatusOK, "console.log(1)"},
		{"/assets/", http.StatusNotFound, ""}, // no directory listings
		{"/healthz", http.StatusOK, `"status":"ok"`},
		{"/api/v1/nope", http.StatusNotFound, `"code":"not_found"`}, // API 404s stay JSON
	}
	for _, tt := range tests {
		status, body := get(t, s.url+tt.path)
		if status != tt.wantStatus || !strings.Contains(body, tt.wantBody) {
			t.Errorf("GET %s = %d %q, want %d containing %q", tt.path, status, body, tt.wantStatus, tt.wantBody)
		}
	}
}

func TestRunFailsWhenPortIsBusy(t *testing.T) {
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	_, port, _ := net.SplitHostPort(ln.Addr().String())

	env := map[string]string{"PORT": port}
	err = run(context.Background(), func(k string) string { return env[k] }, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "listen") {
		t.Fatalf("run = %v, want a listen error", err)
	}
	var opErr *net.OpError
	if !errors.As(err, &opErr) {
		t.Errorf("run error %v does not wrap the *net.OpError", err)
	}
}
