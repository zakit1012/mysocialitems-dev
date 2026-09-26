const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
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
    const payload = data as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(", ")
      : payload?.message || "Request failed";
    throw new ApiError(response.status, message);
  }

  return data as T;
}
