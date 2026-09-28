const trustedFrontendOrigins = [
  'https://pixxtech-expense-tracker.vercel.app',
  'https://pixxtech-expense-tracker-fz2h.vercel.app',
];

const normalizeOrigin = (value) => {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

export const getCorsAllowedOrigins = (env = process.env) => {
  const configuredOrigins = String(env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);
  return new Set([...trustedFrontendOrigins, ...configuredOrigins]);
};

export const isCorsOriginAllowed = (origin, env = process.env) => {
  if (!origin) return true;
  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin !== null && getCorsAllowedOrigins(env).has(normalizedOrigin);
};
