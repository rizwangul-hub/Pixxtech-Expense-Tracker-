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
  if (!normalizedOrigin) return false;

  // Check explicit allowed origins list
  if (getCorsAllowedOrigins(env).has(normalizedOrigin)) {
    return true;
  }

  // Allow any official Pixxtech Vercel production or preview deployment:
  // e.g. https://pixxtech-expense-tracker-*.vercel.app
  try {
    const parsed = new URL(normalizedOrigin);
    if (parsed.protocol === 'https:' && /^pixxtech-expense-tracker.*\.vercel\.app$/.test(parsed.hostname)) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};
