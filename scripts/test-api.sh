#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t pixel-unsplash-proxy)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

request() {
  path="$1"
  body_file="$2"
  status_file="$3"
  curl -sS -o "$body_file" "$BASE_URL$path"
  curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL$path" > "$status_file"
}

json_value() {
  file="$1"
  expr="$2"
  node -e 'const fs=require("fs"); const file=process.argv[1]; const expr=process.argv[2]; const text=fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""); const data=JSON.parse(text); const value=Function("data", `return (${expr});`)(data); if (value === undefined || value === null || value === false || value === 0 || value === "") process.exit(2); process.stdout.write(String(value));' "$file" "$expr"
}

validate_json() {
  label="$1"
  file="$2"
  node -e 'const fs=require("fs"); const file=process.argv[1]; try { JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")); } catch (error) { console.error(`[FAIL] ${process.argv[2]} (invalid JSON)`); console.error("Body preview:"); console.error(fs.readFileSync(file, "utf8").slice(0, 512)); console.error(`Parse error: ${error.message}`); process.exit(1); }' "$file" "$label"
}

check_json() {
  label="$1"
  path="$2"
  expected_status="$3"
  expr="$4"
  body_file="$TMP_DIR/body"
  status_file="$TMP_DIR/status"
  request "$path" "$body_file" "$status_file"
  status="$(cat "$status_file")"
  [ "$status" = "$expected_status" ] || { printf '[FAIL] %s (%s)\n' "$label" "$status" >&2; printf 'Body preview: ' >&2; sed -n '1,3p' "$body_file" >&2; exit 1; }
  validate_json "$label" "$body_file"
  json_value "$body_file" "$expr" >/dev/null 2>&1 || { printf '[FAIL] %s (missing expected JSON field)\n' "$label" >&2; exit 1; }
  pass "$label ($status)"
}

check_json "GET /health" "/health" 200 'data.ok === true'
check_json "GET /pixel/update" "/pixel/update" 200 'data.data && data.data.versionCode !== undefined && data.data.versionName && data.data.message !== undefined && data.data.ignoreButtonText !== undefined && data.data.splashImageUrl !== undefined && Array.isArray(data.data.links) && data.data.links[0] && data.data.links[0].text && data.data.links[0].url'

check_json "GET /napi/search/photos" "/napi/search/photos?page=1&per_page=20&query=dota" 200 'Array.isArray(data.results) && data.results.length > 0'
photo_id="$(node -e 'const fs=require("fs"); const text=fs.readFileSync(process.argv[1], "utf8").replace(/^\uFEFF/, ""); const data=JSON.parse(text); const id=data.results && data.results[0] && data.results[0].id; if (!id) process.exit(2); process.stdout.write(String(id));' "$TMP_DIR/body" 2>/dev/null || true)"
[ -n "$photo_id" ] || fail "GET /napi/search/photos (missing photo id)"
check_json "GET /napi/photos/{id}" "/napi/photos/$photo_id" 200 'data.id || data.slug || data.current'
check_json "GET /napi/photos" "/napi/photos?page=1&per_page=20&order_by=latest" 200 'Array.isArray(data.results) && data.results.length > 0'
check_json "GET /napi/photos/random" "/napi/photos/random" 200 'data.id || data.slug'
check_json "GET /napi/topics" "/napi/topics?page=1&per_page=20" 200 '(Array.isArray(data.topics) && data.topics.length > 0) || (Array.isArray(data.results) && data.results.length > 0) || (Array.isArray(data) && data.length > 0)'
topic_id="$(node -e 'const fs=require("fs"); const text=fs.readFileSync(process.argv[1], "utf8").replace(/^\uFEFF/, ""); const data=JSON.parse(text); const t=(data.topics && data.topics[0]) || (data.results && data.results[0]) || data[0]; const id=t && t.id; if (!id) process.exit(2); process.stdout.write(String(id));' "$TMP_DIR/body" 2>/dev/null || true)"
[ -n "$topic_id" ] || fail "GET /napi/topics (missing topic id)"
check_json "GET /napi/topics/{id}/photos" "/napi/topics/$topic_id/photos" 200 'Array.isArray(data.results) && data.results.length > 0'
check_json "GET /napi/users/{username}/photos" "/napi/users/timothymeinberg/photos" 200 'Array.isArray(data.results) && data.results.length > 0'
check_json "GET /nautocomplete/{query}" "/nautocomplete/dot" 200 'Array.isArray(data.autocomplete) && data.autocomplete.length > 0'
check_json "GET /napi/search/collections" "/napi/search/collections?page=1&per_page=20&query=nature" 200 'Array.isArray(data.results) && data.results.length > 0'

printf 'All API smoke tests passed.\n'
