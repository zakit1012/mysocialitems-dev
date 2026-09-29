// Brand colours for emails, the same as the website.
export const BRAND = '#0096D6';
export const BRAND_FROM = '#38BDF8';
export const INK = '#1E293B';
export const TEXT = '#334155';
export const MUTED = '#94A3B8';
export const WASH = '#E6F4FB';
export const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}
