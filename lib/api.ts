export type ApiOk<T extends object = object> = { success: true } & T;

export type ApiErr = { success: false; message?: string } & Record<string, unknown>;

export type ApiResponse<T extends object = object> = ApiOk<T> | ApiErr;

function getBaseUrl() {
  return "";
}

export async function apiFetch<T extends object>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
  getToken?: (() => Promise<string | null>) | null,
): Promise<ApiResponse<T>> {
  const url = `${getBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (getToken) {
    const token = await getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    body:
      init.body === undefined
        ? undefined
        : isFormData
          ? (init.body as FormData)
          : JSON.stringify(init.body),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    const msg =
      typeof (json as any)?.message === "string"
        ? (json as any).message
        : `Request failed (${res.status})`;
    return { success: false, message: msg };
  }

  return (json as ApiResponse<T>) ?? ({ success: true } as ApiOk<T>);
}
