const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// What people read when the problem is not theirs to fix. Never "Failed to
// fetch", a status code, or a proxy's HTML error page.
const OFFLINE = "Could not reach WidgetPop. Check your internet connection and try again.";
const BUSY = "WidgetPop is busy or updating right now. Please try again in a minute.";
const TOO_MANY = "Too many tries in a short time. Please wait a minute and try again.";
const BROKEN = "Something went wrong on our side. Please try again in a minute.";

/** The sentence for a failed call: the API's own message when it wrote one for people. */
function friendly(status: number, message: string | undefined, fromApi: boolean): string {
  if (status === 429) return TOO_MANY;
  // Not our JSON: nginx or a load balancer answered while the API was down.
  if (!fromApi) return status >= 500 ? BUSY : BROKEN;
  if (status >= 500 && (!message || /^internal server error$/i.test(message))) return BROKEN;
  return message || BROKEN;
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${API}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
    text = await response.text();
  } catch (err) {
    // A call the page itself called off is not an error to show.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, OFFLINE);
  }

  let data: unknown = null;
  let fromApi = false;
  if (text) {
    try {
      data = JSON.parse(text);
      fromApi = typeof data === "object" && data !== null;
    } catch {
      data = null;
    }
  }

  // A signed-in call refused as unauthorized: the session ran out. Inside the
  // app, go to the login page (and come back after) instead of error boxes.
  if (response.status === 401 && token && typeof window !== "undefined") {
    localStorage.removeItem("sd_token");
    const { pathname, search } = window.location;
    if (/^\/(dashboard|admin|invoice)(\/|$)/.test(pathname)) {
      // A full page load on purpose: it clears everything the old session held.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`${window.location.origin}/login?next=${encodeURIComponent(pathname + search)}`);
    }
  }

  if (!response.ok) {
    const payload = fromApi ? (data as { message?: string | string[] }) : null;
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new ApiError(response.status, friendly(response.status, message, fromApi));
  }

  return data as T;
}
