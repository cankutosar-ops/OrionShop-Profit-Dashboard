/** Keep consumed Auth query parameters out of a hosting platform's redirect fallback. */
export function authRedirectUrl(destination: string, origin: string): URL {
  const url = new URL(destination, origin);
  // Netlify forwards the incoming query when Location has no query of its own.
  // This inert marker is never an authentication or authorization signal.
  if (!url.search) url.searchParams.set('_auth_redirect', '1');
  return url;
}
