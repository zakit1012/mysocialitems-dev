/**
 * Domains are stored as a bare host: no scheme, no port, no path, no "www.".
 * Users paste all of those, and a mismatch here means a widget silently
 * refusing to load on a site they did register.
 */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  if (!value.includes('://')) value = `https://${value}`;
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    return null;
  }

  host = host.replace(/^www\./, '');
  if (!host || !host.includes('.') || host.endsWith('.')) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

export function hostFrom(originOrReferer: string | undefined): string | null {
  if (!originOrReferer) return null;
  try {
    return new URL(originOrReferer).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function hostMatches(host: string, allowed: string[]): boolean {
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}
