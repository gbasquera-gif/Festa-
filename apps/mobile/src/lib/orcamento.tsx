import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EventType } from "@festae/shared";

const STORAGE_KEY = "festae_orcamento";

export interface OrcamentoItem {
  productId: string;
  quantity: number;
}

interface OrcamentoState {
  kitId: string | null;
  items: OrcamentoItem[];
  /**
   * Ocasião escolhida na vitrine. Guardada aqui para o formulário de criar a
   * festa já vir com ela marcada: quem entrou por "Chá de bebê" e teve de
   * escolher de novo no passo seguinte tinha razão em achar que o app não
   * estava prestando atenção.
   */
  eventType: EventType | null;
}

const EMPTY: OrcamentoState = { kitId: null, items: [], eventType: null };

interface OrcamentoContextValue extends OrcamentoState {
  /** Total de peças (soma das quantidades) + 1 se houver kit escolhido. */
  count: number;
  ready: boolean;
  quantityOf: (productId: string) => number;
  addProduct: (productId: string, quantity?: number) => void;
  setProductQuantity: (productId: string, quantity: number) => void;
  removeProduct: (productId: string) => void;
  setKit: (kitId: string | null) => void;
  setEventType: (eventType: EventType | null) => void;
  clear: () => void;
}

const OrcamentoContext = createContext<OrcamentoContextValue | null>(null);

/**
 * Orçamento em construção, guardado no aparelho. O usuário monta a lista
 * navegando pelo catálogo sem precisar ter criado um evento ainda — só ao
 * fechar o orçamento é que os itens viram um pedido no backend.
 */
export function OrcamentoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrcamentoState>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as OrcamentoState) });
      } catch {
        // Orçamento corrompido não pode impedir o app de abrir — começa vazio.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Só persiste depois da carga inicial, senão o estado vazio do primeiro
  // render sobrescreveria o orçamento salvo.
  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const setProductQuantity = useCallback((productId: string, quantity: number) => {
    setState((current) => {
      if (quantity <= 0) {
        return { ...current, items: current.items.filter((item) => item.productId !== productId) };
      }
      const exists = current.items.some((item) => item.productId === productId);
      return {
        ...current,
        items: exists
          ? current.items.map((item) => (item.productId === productId ? { ...item, quantity } : item))
          : [...current.items, { productId, quantity }],
      };
    });
  }, []);

  const addProduct = useCallback((productId: string, quantity = 1) => {
    setState((current) => {
      const existing = current.items.find((item) => item.productId === productId);
      return {
        ...current,
        items: existing
          ? current.items.map((item) =>
              item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item,
            )
          : [...current.items, { productId, quantity }],
      };
    });
  }, []);

  const removeProduct = useCallback(
    (productId: string) => setProductQuantity(productId, 0),
    [setProductQuantity],
  );

  const setKit = useCallback((kitId: string | null) => {
    setState((current) => ({ ...current, kitId }));
  }, []);

  const setEventType = useCallback((eventType: EventType | null) => {
    setState((current) => (current.eventType === eventType ? current : { ...current, eventType }));
  }, []);

  const clear = useCallback(() => setState(EMPTY), []);

  const value = useMemo<OrcamentoContextValue>(() => {
    const count = state.items.reduce((sum, item) => sum + item.quantity, 0) + (state.kitId ? 1 : 0);
    return {
      ...state,
      count,
      ready,
      quantityOf: (productId) => state.items.find((item) => item.productId === productId)?.quantity ?? 0,
      addProduct,
      setProductQuantity,
      removeProduct,
      setKit,
      setEventType,
      clear,
    };
  }, [state, ready, addProduct, setProductQuantity, removeProduct, setKit, setEventType, clear]);

  return <OrcamentoContext.Provider value={value}>{children}</OrcamentoContext.Provider>;
}

export function useOrcamento() {
  const ctx = useContext(OrcamentoContext);
  if (!ctx) throw new Error("useOrcamento deve ser usado dentro de OrcamentoProvider.");
  return ctx;
}
