import { NextResponse } from "next/server";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

/**
 * A short review link, as printed in QR codes: widgetpop.com/r/abc1234. The
 * API behind it counts the open and sends the visitor on to the business's
 * Google review form; the address stays ours, so printed posters keep working.
 */
export function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const response = NextResponse.redirect(`${API}/r/${encodeURIComponent(slug)}`, 302);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  });
}
