const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api/v1";
const TOKEN_KEY = "festae_admin_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? `Erro ${res.status}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function uploadImage(folder: "themes" | "kits" | "products", file: File): Promise<{ url: string }> {
  const token = getToken();
  const body = new FormData();
  body.append("file", file);

  // Sem Content-Type manual de propósito: o browser define o boundary do
  // multipart sozinho. Forçar "application/json" (como o helper `api`
  // faz) quebraria o upload.
  const res = await fetch(`${API_URL}/uploads/image/${folder}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    throw new ApiError(responseBody.message ?? `Erro ${res.status}`, res.status);
  }
  return res.json();
}
