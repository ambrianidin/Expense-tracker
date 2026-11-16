



export const UNAUTHORIZED_EVENT = "budgetly:unauthorized";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const CSRF_COOKIE = "budgetly_csrf";
let csrfRequest: Promise<string> | null = null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function ensureCsrf(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  csrfRequest ??= fetch("/api/v1/auth/csrf", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((d: { csrf_token: string }) => d.csrf_token)
    .finally(() => {
      csrfRequest = null;
    });
  return csrfRequest;
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T>(path: string, { method = "GET", body, signal }: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = await ensureCsrf();

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network_error", "Tidak dapat terhubung ke server. Periksa koneksimu.");
  }

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "server_error",
      e?.message ?? (res.status >= 500 ? "Server sedang bermasalah. Coba lagi sebentar." : "Permintaan gagal."),
      e?.fields ?? {},
    );
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
