// Client-side Router

function navigateTo(url) {
  window.location.href = url;
}

function navigateBack() {
  window.history.back();
}

// Get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

// Set URL parameter
function setUrlParam(key, value) {
  const url = new URL(window.location);
  url.searchParams.set(key, value);
  window.history.pushState({}, '', url);
}

// Remove URL parameter
function removeUrlParam(key) {
  const url = new URL(window.location);
  url.searchParams.delete(key);
  window.history.pushState({}, '', url);
}

// Build URL with parameters
function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
