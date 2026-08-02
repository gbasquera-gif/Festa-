import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "festae_favoritos";

export type FavoriteKind = "product" | "kit";

interface FavoritesState {
  products: string[];
  kits: string[];
}

const EMPTY: FavoritesState = { products: [], kits: [] };

interface FavoritesContextValue extends FavoritesState {
  isFavorite: (kind: FavoriteKind, id: string) => boolean;
  toggle: (kind: FavoriteKind, id: string) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/** Favoritos vivem só no aparelho — não há endpoint de wishlist no backend. */
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FavoritesState>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as FavoritesState) });
      } catch {
        // Ignora dado corrompido e recomeça a lista.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const toggle = useCallback((kind: FavoriteKind, id: string) => {
    setState((current) => {
      const key = kind === "product" ? "products" : "kits";
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
      };
    });
  }, []);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      ...state,
      isFavorite: (kind, id) => (kind === "product" ? state.products : state.kits).includes(id),
      toggle,
    }),
    [state, toggle],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavoritos() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavoritos deve ser usado dentro de FavoritesProvider.");
  return ctx;
}
