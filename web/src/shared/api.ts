import { translator, type Translate } from "../i18n/messages";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly kind: "http" | "network" | "contract" | "config" = "http",
    public readonly retryAfterSeconds?: number,
  ) {
    super(kind === "http" ? `HTTP ${status}` : kind);
    this.name = "ApiError";
  }
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function apiBase(): string {
  const value = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!value) throw new ApiError(0, "config");
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    if (
      url.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      throw new Error();
    }
    return url.href.replace(/\/$/, "");
  } catch {
    throw new ApiError(0, "config");
  }
}

export function retrySeconds(
  header: string | null,
  body: unknown,
): number | undefined {
  if (header !== null) {
    if (/^\d+$/.test(header.trim()) && Number.isSafeInteger(Number(header)))
      return Number(header);
    const date = Date.parse(header);
    if (Number.isFinite(date))
      return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  if (
    record(body) &&
    typeof body.retryAfterSeconds === "number" &&
    Number.isFinite(body.retryAfterSeconds) &&
    body.retryAfterSeconds >= 0
  ) {
    return Math.ceil(body.retryAfterSeconds);
  }
}

export async function request<T>(
  path: string,
  expectedStatus: number,
  validate: (body: unknown) => body is T,
  options: { body?: unknown; token?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const url = apiBase() + path;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, "network");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      "http",
      retrySeconds(response.headers.get("Retry-After"), body),
    );
  if (response.status !== expectedStatus || !validate(body))
    throw new ApiError(response.status, "contract");
  return body;
}

export function errorMessage(
  error: unknown,
  context: "login" | "register" | "session" = "session",
  t: Translate = translator("ar"),
): string {
  if (!(error instanceof ApiError)) return t("error.unexpected");
  if (error.kind === "network") return t("error.network");
  if (error.kind === "config") return t("error.config");
  if (error.kind === "contract") return t("error.contract");
  switch (error.status) {
    case 400:
      return t("error.badRequest");
    case 401:
      return context === "login" ? t("error.credentials") : t("error.session");
    case 403:
      return t("error.inactive");
    case 409:
      return context === "register"
        ? t("error.duplicate")
        : t("error.conflict");
    case 429:
      return error.retryAfterSeconds === undefined
        ? t("error.rateLimit")
        : t(
            error.retryAfterSeconds === 1
              ? "error.retrySecond"
              : "error.retrySeconds",
            { seconds: error.retryAfterSeconds },
          );
    case 503:
      return t("error.unavailable");
    default:
      return t("error.request");
  }
}
