# pixel-unsplash-proxy

Proxy server for Pixel Android app to forward a small allowlist of Unsplash API paths to `https://unsplash.com`.

## 1. Install dependencies

```bash
npm install
```

## 2. Development

```bash
npm run dev
```

## 3. Build

```bash
npm run build
```

## 4. Production start

```bash
npm run start
```

## 5. Environment variables

- `PORT` - server port
- `UPSTREAM_TIMEOUT_MS` - upstream timeout in milliseconds
- `RATE_LIMIT_WINDOW_MS` - rate limit window in milliseconds
- `RATE_LIMIT_MAX` - maximum requests per window per IP

## 6. Port

The default port is `8080`.

## 7. Allowed endpoints

Only these GET paths are proxied:

- `/napi/photos`
- `/napi/search/photos`
- `/napi/photos/:id`
- `/napi/photos/random`
- `/napi/topics`
- `/napi/topics/:id/photos`
- `/napi/users/:username/photos`
- `/nautocomplete/:query`
- `/napi/search/collections`

The proxy does not accept arbitrary destination URLs.

## 8. Test health

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{ "ok": true }
```

## 9. Test proxy

Example requests:

```bash
curl "http://localhost:8080/napi/search/photos?page=1&per_page=20&query=dota"
curl "http://localhost:8080/napi/photos?page=1&per_page=20&order_by=latest"
curl "http://localhost:8080/napi/topics?page=1&per_page=20"
```

These requests forward the path and query string to Unsplash and return the upstream status, content-type, and body.

## 10. API smoke test

Run the end-to-end API smoke test against a running server:

```bash
./scripts/test-api.sh
```

The script checks all implemented API endpoints and prints a pass/fail report.
