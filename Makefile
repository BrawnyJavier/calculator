# Common tasks. Run `make help` for the list.

.DEFAULT_GOAL := help
.PHONY: help install run-backend run-frontend test lint coverage build docker docker-run ci

IMAGE ?= calculator

help: ## List available targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

install: ## Install frontend dependencies (the backend has none)
	cd frontend && npm ci

run-backend: ## Run the API on :8080
	cd backend && go run ./cmd/server

run-frontend: ## Run the Vite dev server on :5173 (proxies /api to :8080)
	cd frontend && npm run dev

test: ## Run all unit tests
	cd backend && go test -race ./...
	cd frontend && npm test

lint: ## Static checks: gofmt, go vet, oxlint, TypeScript
	@test -z "$$(gofmt -l backend)" || (echo "gofmt needed:"; gofmt -l backend; exit 1)
	cd backend && go vet ./...
	cd frontend && npm run lint && npm run typecheck

coverage: ## Coverage reports: backend/coverage.html, frontend/coverage/index.html
	cd backend && go test -race -coverprofile=coverage.out ./... && go tool cover -func=coverage.out | tail -1 && go tool cover -html=coverage.out -o coverage.html
	cd frontend && npm run coverage

build: ## Build the server binary and the frontend bundle
	cd backend && CGO_ENABLED=0 go build -trimpath -o bin/server ./cmd/server
	cd frontend && npm run build

docker: ## Build the single-container image
	docker build -t $(IMAGE) .

docker-run: docker ## Build and run the image on :8080
	docker run --rm -p 8080:8080 $(IMAGE)

ci: lint test build ## Everything CI runs, except the Docker build
