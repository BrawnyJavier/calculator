# One image serves both the built frontend and the API from the same origin,
# so no CORS configuration is needed.

# 1. Build the frontend bundle.
FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Build a static Go binary (stdlib only, so there is no module download step).
FROM golang:1.27.3-alpine AS backend
WORKDIR /src
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# 3. Minimal runtime: no shell or package manager, runs as non-root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /out/server /app/server
COPY --from=frontend /src/dist /app/static
ENV PORT=8080 STATIC_DIR=/app/static
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
