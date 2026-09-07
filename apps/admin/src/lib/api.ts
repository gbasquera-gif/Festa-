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
    /**
     * O corpo inteiro da resposta de erro.
     *
     * Alguns erros trazem mais que uma frase: o conflito de estoque da
     * reserva manual devolve produto, quantidades e as reservas em choque,
     * e a tela precisa disso para a operação poder decidir. Sem guardar o
     * corpo, essa informação morria aqui e virava um "erro 409" na tela.
     */
    public detalhes?: Record<string, unknown>,
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
    // O Nest embrulha um corpo de erro estruturado dentro de `message`.
    // Desembrulhar aqui é o que faz o detalhe do conflito chegar à tela.
    const corpo = typeof body.message === "object" && body.message !== null ? body.message : body;
    const texto =
      typeof corpo.message === "string" ? corpo.message : `Erro ${res.status}`;
    throw new ApiError(texto, res.status, corpo);
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

/**
 * Baixa um arquivo de uma rota protegida.
 *
 * Um `<a href>` comum não serve: a rota exige o token no cabeçalho, e o
 * navegador não o envia numa navegação normal — o download voltaria 401.
 * Então busca-se o conteúdo com o token e entrega-se ao navegador como blob.
 */
export async function baixarArquivo(path: string, nomeDoArquivo: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? `Erro ${res.status}`, res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeDoArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Sem isto o blob fica na memória da aba até ela ser fechada.
  URL.revokeObjectURL(url);
}
