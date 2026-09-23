import process from 'node:process';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:8080';

const endpoints = [
  {
    label: 'GET /health',
    path: '/health',
    expectedStatus: 200,
    validate: (data) => data.ok === true,
  },
  {
    label: 'GET /pixel/update',
    path: '/pixel/update',
    expectedStatus: 200,
    validate: (data) => data?.data?.versionCode !== undefined
      && data?.data?.versionName
      && data?.data?.message !== undefined
      && data?.data?.ignoreButtonText !== undefined
      && data?.data?.splashImageUrl !== undefined
      && Array.isArray(data?.data?.links)
      && data.data.links[0]
      && data.data.links[0].text
      && data.data.links[0].url,
  },
  {
    label: 'GET /napi/search/photos',
    path: '/napi/search/photos?page=1&per_page=20&query=dota',
    expectedStatus: 200,
    validate: (data) => Array.isArray(data.results) && data.results.length > 0,
    extract: (data) => data.results?.[0]?.id,
  },
  {
    label: 'GET /napi/photos/{id}',
    path: null,
    expectedStatus: 200,
    validate: (data) => data.id || data.slug || data.current,
  },
  {
    label: 'GET /napi/photos',
    path: '/napi/photos?page=1&per_page=20&order_by=latest',
    expectedStatus: 200,
    validate: (data) => Array.isArray(data.results) && data.results.length > 0,
    extract: (data) => data.results?.[0]?.id,
  },
  {
    label: 'GET /napi/photos/random',
    path: '/napi/photos/random',
    expectedStatus: 200,
    validate: (data) => data.id || data.slug,
  },
  {
    label: 'GET /napi/topics',
    path: '/napi/topics?page=1&per_page=20',
    expectedStatus: 200,
    validate: (data) => (Array.isArray(data.topics) && data.topics.length > 0)
      || (Array.isArray(data.results) && data.results.length > 0)
      || (Array.isArray(data) && data.length > 0),
    extract: (data) => data.topics?.[0]?.id ?? data.results?.[0]?.id ?? data[0]?.id,
  },
  {
    label: 'GET /napi/topics/{id}/photos',
    path: null,
    expectedStatus: 200,
    validate: (data) => Array.isArray(data.results) && data.results.length > 0,
  },
  {
    label: 'GET /napi/users/{username}/photos',
    path: '/napi/users/timothymeinberg/photos',
    expectedStatus: 200,
    validate: (data) => Array.isArray(data.results) && data.results.length > 0,
  },
  {
    label: 'GET /nautocomplete/{query}',
    path: '/nautocomplete/dot',
    expectedStatus: 200,
    validate: (data) => Array.isArray(data.autocomplete) && data.autocomplete.length > 0,
  },
  {
    label: 'GET /napi/search/collections',
    path: '/napi/search/collections?page=1&per_page=20&query=nature',
    expectedStatus: 200,
    validate: (data) => Array.isArray(data.results) && data.results.length > 0,
  },
];

const fail = (label, status, preview, error) => {
  console.error(`[FAIL] ${label} (${status})`);
  if (preview) console.error(`Body preview: ${preview}`);
  if (error) console.error(`Parse error: ${error}`);
  process.exitCode = 1;
};

const pass = (label, status) => {
  console.log(`[PASS] ${label} (${status})`);
};

const previewBody = (text) => text.slice(0, 240).replace(/\s+/g, ' ').trim();

const fetchJson = async (label, path) => {
  const response = await fetch(new URL(path, baseUrl), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const status = response.status;
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    fail(label, status, previewBody(text), error?.message ?? String(error));
    return { ok: false };
  }
  return { ok: true, status, data, text };
};

let searchPhotosData;
let topicsData;

for (const endpoint of endpoints) {
  if (endpoint.label === 'GET /napi/photos/{id}') {
    const photoId = searchPhotosData?.results?.[0]?.id;
    if (!photoId) {
      fail(endpoint.label, 'n/a', '', 'missing photo id from /napi/search/photos');
      continue;
    }
    endpoint.path = `/napi/photos/${photoId}`;
  }
  if (endpoint.label === 'GET /napi/topics/{id}/photos') {
    const topicId = topicsData?.topics?.[0]?.id ?? topicsData?.results?.[0]?.id ?? topicsData?.[0]?.id;
    if (!topicId) {
      fail(endpoint.label, 'n/a', '', 'missing topic id from /napi/topics');
      continue;
    }
    endpoint.path = `/napi/topics/${topicId}/photos`;
  }

  const result = await fetchJson(endpoint.label, endpoint.path);
  if (!result.ok) continue;
  const { status, data, text } = result;
  if (status !== endpoint.expectedStatus) {
    fail(endpoint.label, status, previewBody(text));
    continue;
  }
  if (!endpoint.validate(data)) {
    fail(endpoint.label, status, previewBody(text), 'missing expected JSON field');
    continue;
  }
  if (endpoint.label === 'GET /napi/search/photos') searchPhotosData = data;
  if (endpoint.label === 'GET /napi/topics') topicsData = data;
  pass(endpoint.label, status);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('All API smoke tests passed.');
