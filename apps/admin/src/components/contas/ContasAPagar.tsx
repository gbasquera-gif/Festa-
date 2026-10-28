import { useFiltroNaUrl } from "@/lib/filtro-na-url";
import { Avisos } from "./Avisos";
import { ListaDeContas } from "./ListaDeContas";
import { Recorrencias } from "./Recorrencias";

const VISTAS = [
  { chave: "contas", rotulo: "Contas" },
  { chave: "recorrentes", rotulo: "Despesas recorrentes" },
  { chave: "avisos", rotulo: "Avisos" },
] as const;
type Vista = (typeof VISTAS)[number]["chave"];

/**
 * A aba Contas a pagar do Financeiro.
 *
 * Três vistas sobre a mesma coisa: as contas (o que vence e o que foi pago),
 * as despesas recorrentes que geram parte delas, e os avisos. As contas são
 * os mesmos lançamentos de Despesas e Aportes — esta aba não tem totais
 * próprios que possam discordar dos de lá.
 */
export function ContasAPagar({ mes }: { mes: string }) {
  const [vista, setVista] = useFiltroNaUrl<Vista>("ver", "contas", VISTAS.map((v) => v.chave));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
            Contas a pagar
          </h2>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--fin-muted)" }}>
            O que vence e o que falta pagar. Uma conta só sai do caixa quando o pagamento é registrado.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border p-1" role="tablist" aria-label="Vistas de contas a pagar">
          {VISTAS.map((v) => (
            <button
              key={v.chave}
              type="button"
              role="tab"
              aria-selected={vista === v.chave}
              onClick={() => setVista(v.chave)}
              className="min-h-11 rounded-md px-3 text-sm font-medium"
              style={{
                background: vista === v.chave ? "var(--fin-navy-ink)" : "transparent",
                color: vista === v.chave ? "#fff" : "var(--fin-navy-ink)",
              }}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
      </div>

      {vista === "contas" && <ListaDeContas mes={mes} />}
      {vista === "recorrentes" && <Recorrencias />}
      {vista === "avisos" && <Avisos />}
    </div>
  );
}
