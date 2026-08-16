// Base API URL helper for cross-origin or proxied API requests
export const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_CLIENT_URL || '';

export const getApiUrl = (endpoint) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${path}`;
};

export const authFetch = (endpoint, options = {}) => {
  const url = getApiUrl(endpoint);
  return fetch(url, {
    credentials: 'include',
    ...options,
  });
};
