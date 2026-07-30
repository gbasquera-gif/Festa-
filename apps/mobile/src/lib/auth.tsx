import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, TOKEN_KEY } from "./api";
import { getItem, removeItem, setItem } from "./storage";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "CLIENT" | "ADMIN" | "OPS";
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getItem(TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api<AppUser>("/auth/me");
        setUser(me);
      } catch {
        await removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const response = await api<{ accessToken: string; user: AppUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await setItem(TOKEN_KEY, response.accessToken);
    setUser(response.user);
  }

  async function signup(name: string, email: string, password: string, phone?: string) {
    const response = await api<{ accessToken: string; user: AppUser }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password, phone }),
    });
    await setItem(TOKEN_KEY, response.accessToken);
    setUser(response.user);
  }

  async function logout() {
    await removeItem(TOKEN_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return ctx;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
