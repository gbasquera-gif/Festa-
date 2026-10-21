import { useFiltroNaUrl } from "@/lib/filtro-na-url";
import { Contratos } from "@/components/financeiro/Contratos";
import { Evolucao } from "@/components/financeiro/Evolucao";
import { Gastos } from "@/components/financeiro/Gastos";
import { VisaoGeral } from "@/components/financeiro/VisaoGeral";
import { MESES, anosDisponiveis, nomeDoMes } from "@/components/financeiro/formato";

/**
 * A área financeira.
 *
 * A diferença para o painel antigo não está na aparência: está em nunca
 * subtrair competência de caixa. Lá, "lucro líquido" somava contrato assinado
 * e descontava conta paga — dois regimes num número só, que em setembro/2026
 * exibia quase três vezes o resultado real.
 *
 * O filtro de ano e mês é global e mora aqui, e não dentro de cada aba: duas
 * abas com períodos próprios fariam a Visão Geral falar de setembro enquanto
 * a Evolução destacava outubro, e quem lê teria de conferir o cabeçalho antes
 * de cada número. Pela mesma razão a carteira e os lançamentos leem este
 * filtro em vez de ter o seu: dois seletores de mês na mesma tela são duas
 * respostas possíveis para "de quando é isto".
 */

const ABAS = [
  { chave: "visao", rotulo: "Visão Geral" },
  { chave: "evolucao", rotulo: "Evolução" },
  { chave: "contratos", rotulo: "Vendas / Contratos" },
  { chave: "despesas", rotulo: "Despesas" },
  { chave: "aportes", rotulo: "Aportes / Acervo" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

/**
 * As abas que aceitam "todos os meses".
 *
 * Visão Geral e Evolução não aceitam, e não é limitação técnica: as duas
 * apuram um mês e comparam com o anterior. "Todos os meses" ali seria um
 * resultado operacional sem competência, que é justamente a conta que o
 * painel antigo fazia — somar contrato de setembro com despesa de março.
 *
 * Carteira e lançamentos são listas: ver tudo é uma pergunta legítima.
 */
const ACEITAM_TODOS: readonly Aba[] = ["contratos", "despesas", "aportes"];
const TODOS = "todos";

export default function Financeiro() {
  // Aba, ano e mês moram na URL: é assim que um contrato aberto daqui volta
  // para o mesmo recorte pelo "← Voltar".
  const [aba, setAba] = useFiltroNaUrl<Aba>("aba", "visao", ABAS.map((a) => a.chave));
  const hoje = new Date();
  const mesCorrente = String(hoje.getUTCMonth() + 1).padStart(2, "0");
  const [anoNaUrl, setAnoNaUrl] = useFiltroNaUrl("ano", String(hoje.getUTCFullYear()));
  const ano = /^\d{4}$/.test(anoNaUrl) ? Number(anoNaUrl) : hoje.getUTCFullYear();
  const setAno = (novo: number) => setAnoNaUrl(String(novo));
  const [mesNaUrl, setMesNumero] = useFiltroNaUrl<string>("mes", mesCorrente, [...MESES, TODOS]);

  const aceitaTodos = ACEITAM_TODOS.includes(aba);
  // Um link com "todos os meses" numa aba que não aceita cai no mês corrente.
  const mesNumero = !aceitaTodos && mesNaUrl === TODOS ? mesCorrente : mesNaUrl;
  const mes = `${ano}-${mesNumero}`;
  /** O que as abas de lista recebem: `null` é "todos os meses". */
  const mesFiltrado = mesNumero === TODOS ? null : mes;

  /**
   * Trocar de aba pode invalidar o mês escolhido.
   *
   * Sair de Despesas com "todos os meses" para a Visão Geral precisa cair em
   * algum mês concreto. Cai no corrente, e não no último escolhido, porque é
   * o que a tela mostraria se tivesse acabado de abrir.
   */
  function trocarAba(nova: Aba) {
    if (!ACEITAM_TODOS.includes(nova) && mesNumero === TODOS) setMesNumero(mesCorrente);
    setAba(nova);
  }

  return (
    <div className="financeiro space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.65rem] font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
            Financeiro
          </h1>
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Tudo é apurado das reservas e dos pagamentos. Nada é digitado duas vezes.
          </p>
        </div>

        <div className="flex items-center gap-2">
            <span className="fin-rotulo">Período</span>
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              aria-label="Ano"
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              {anosDisponiveis().map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={mesNumero}
              onChange={(e) => setMesNumero(e.target.value)}
              aria-label="Mês"
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              {aceitaTodos && <option value={TODOS}>Todos os meses</option>}
              {MESES.map((m) => (
                <option key={m} value={m}>
                  {nomeDoMes(`${ano}-${m}`).replace(` de ${ano}`, "")}
                </option>
              ))}
            </select>
          </div>
      </div>

      <nav
        className="flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--fin-line)" }}
        aria-label="Seções do financeiro"
      >
        {ABAS.map(({ chave, rotulo }) => (
          <button
            key={chave}
            type="button"
            onClick={() => trocarAba(chave)}
            aria-current={aba === chave ? "page" : undefined}
            className="min-h-11 px-4 text-sm font-semibold"
            style={{
              color: aba === chave ? "var(--fin-navy-ink)" : "var(--fin-muted)",
              borderBottom: `2px solid ${aba === chave ? "var(--fin-coral)" : "transparent"}`,
              marginBottom: "-1px",
            }}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === "visao" && <VisaoGeral ano={ano} mes={mes} />}
      {aba === "evolucao" && <Evolucao ano={ano} mes={mes} />}
      {aba === "contratos" && <Contratos mes={mesFiltrado} />}
      {aba === "despesas" && (
        <Gastos
          mes={mesFiltrado}
          naturezas={["CONSUMO", "CUSTEIO"]}
          titulo="Despesas"
          explicacao="O que some na festa e o que mantém a empresa de pé. Entra no resultado do mês em que foi pago."
        />
      )}
      {aba === "aportes" && (
        <Gastos
          mes={mesFiltrado}
          naturezas={["ACERVO"]}
          titulo="Aportes e acervo"
          explicacao="O que vira patrimônio alugável. É capital que fica, não despesa do mês — por isso não derruba o lucro."
        />
      )}
    </div>
  );
}
