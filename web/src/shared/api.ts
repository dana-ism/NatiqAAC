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
): string {
  if (!(error instanceof ApiError))
    return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
  if (error.kind === "network")
    return "تعذّر الاتصال بالخدمة. تحقق من اتصالك وحاول مرة أخرى.";
  if (error.kind === "config")
    return "عنوان الخدمة غير مُهيّأ بشكل صحيح. يرجى التواصل مع فريق التطبيق.";
  if (error.kind === "contract")
    return "وصل رد غير متوقع من الخدمة. يرجى المحاولة لاحقًا.";
  switch (error.status) {
    case 400:
      return "بعض البيانات غير مقبولة. راجع الحقول وحاول مرة أخرى.";
    case 401:
      return context === "login"
        ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
        : "انتهت الجلسة أو لم تعد صالحة. سجّل الدخول مجددًا.";
    case 403:
      return "هذا الحساب غير نشط. يرجى التواصل مع فريق التطبيق.";
    case 409:
      return context === "register"
        ? "هذا البريد مسجّل بالفعل. يمكنك تسجيل الدخول إلى حسابك."
        : "تعذّر إتمام الطلب بسبب تعارض في البيانات.";
    case 429:
      return error.retryAfterSeconds === undefined
        ? "طلبات كثيرة في وقت قصير. يرجى المحاولة لاحقًا."
        : `طلبات كثيرة في وقت قصير. يمكنك المحاولة بعد ${error.retryAfterSeconds} ثانية.`;
    case 503:
      return "الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.";
    default:
      return "تعذّر إتمام الطلب. يرجى المحاولة لاحقًا.";
  }
}
