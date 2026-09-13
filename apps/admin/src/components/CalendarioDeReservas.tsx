import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { diaDaFesta, diaEmChapeco } from "@festae/shared";

/** O que o calendário precisa saber de cada reserva. Nada além disso. */
export interface FestaNoCalendario {
  id: string;
  eventDate: string;
  cliente: string;
  status: string;
  entrega: boolean;
  total: number;
  saldo: number;
}

const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * A cor de uma festa no calendário diz o que falta fazer nela.
 *
 * Deliberado: não é a cor do status da reserva, e sim a do dinheiro. Quem
 * olha o mês inteiro está procurando o que exige ação, e "confirmada" não
 * exige nada — "confirmada e sem sinal" exige. Cancelada fica apagada
 * porque continua no histórico mas não é trabalho de ninguém.
 */
function situacaoDaFesta(f: FestaNoCalendario) {
  if (f.status === "CANCELLED" || f.status === "REJECTED") {
    return { classe: "festa-cancelada", titulo: "cancelada" };
  }
  if (f.saldo <= 0) return { classe: "festa-paga", titulo: "paga integralmente" };
  if (f.saldo < f.total) return { classe: "festa-sinal", titulo: "sinal recebido" };
  return { classe: "festa-sem-sinal", titulo: "sem pagamento" };
}

/** As semanas do mês, cada uma com sete dias — domingo a sábado. */
function semanasDoMes(ano: number, mes: number): (string | null)[][] {
  const primeiro = new Date(Date.UTC(ano, mes, 1));
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const celulas: (string | null)[] = Array(primeiro.getUTCDay()).fill(null);

  for (let dia = 1; dia <= diasNoMes; dia++) {
    celulas.push(new Date(Date.UTC(ano, mes, dia)).toISOString().slice(0, 10));
  }
  while (celulas.length % 7 !== 0) celulas.push(null);

  return Array.from({ length: celulas.length / 7 }, (_, i) => celulas.slice(i * 7, i * 7 + 7));
}

/**
 * O mês de festas, em grade.
 *
 * A lista responde "quais são as reservas"; a grade responde "como está
 * setembro" — que é a pergunta que se faz olhando para uma agenda. Duas
 * festas no mesmo sábado, uma semana vazia, o feriado que ninguém reservou:
 * nenhuma dessas coisas aparece numa lista ordenada por data.
 */
export function CalendarioDeReservas({ festas }: { festas: FestaNoCalendario[] }) {
  const hoje = diaEmChapeco(new Date());
  const [cursor, setCursor] = useState(() => {
    const [ano, mes] = hoje.split("-").map(Number);
    return { ano, mes: mes - 1 };
  });

  const porDia = useMemo(() => {
    const mapa = new Map<string, FestaNoCalendario[]>();
    for (const f of festas) {
      const dia = diaDaFesta(f.eventDate);
      const lista = mapa.get(dia) ?? [];
      lista.push(f);
      mapa.set(dia, lista);
    }
    mapa.forEach((lista) => lista.sort((a, b) => a.cliente.localeCompare(b.cliente)));
    return mapa;
  }, [festas]);

  const semanas = useMemo(() => semanasDoMes(cursor.ano, cursor.mes), [cursor]);

  const mover = (passo: number) => {
    setCursor(({ ano, mes }) => {
      const d = new Date(Date.UTC(ano, mes + passo, 1));
      return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() };
    });
  };

  const doMes = festas.filter((f) => {
    const [a, m] = diaDaFesta(f.eventDate).split("-").map(Number);
    return a === cursor.ano && m - 1 === cursor.mes;
  });
  const ativas = doMes.filter((f) => f.status !== "CANCELLED" && f.status !== "REJECTED");
  const aReceber = ativas.reduce((soma, f) => soma + f.saldo, 0);

  return (
    <div className="calendario">
      <header className="calendario-topo">
        <div className="calendario-navegacao">
          <button type="button" onClick={() => mover(-1)} aria-label="Mês anterior">
            <ChevronLeft className="size-5" />
          </button>
          <h2>
            {MESES[cursor.mes]} <span>{cursor.ano}</span>
          </h2>
          <button type="button" onClick={() => mover(1)} aria-label="Próximo mês">
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* O resumo do mês fica junto da navegação: quem troca de mês está
            comparando meses, e a comparação precisa do número ao lado. */}
        <dl className="calendario-resumo">
          <div>
            <dt>Festas</dt>
            <dd>{ativas.length}</dd>
          </div>
          <div>
            <dt>A receber</dt>
            <dd className={aReceber > 0 ? "tom-atencao" : "tom-ok"}>{brl(aReceber)}</dd>
          </div>
        </dl>
      </header>

      <div className="calendario-grade" role="grid">
        {DIAS_DA_SEMANA.map((d) => (
          <div key={d} className="calendario-cabecalho" role="columnheader">
            {d}
          </div>
        ))}

        {semanas.flat().map((dia, i) => {
          if (!dia) return <div key={`vazio-${i}`} className="calendario-dia fora" />;
          const doDia = porDia.get(dia) ?? [];
          const ehHoje = dia === hoje;
          return (
            <div key={dia} className={`calendario-dia${ehHoje ? " hoje" : ""}`} role="gridcell">
              <span className="numero-do-dia">{Number(dia.slice(-2))}</span>
              <div className="festas-do-dia">
                {doDia.map((f) => {
                  const s = situacaoDaFesta(f);
                  return (
                    <Link
                      key={f.id}
                      href={`/reservas/${f.id}/editar`}
                      className={`festa ${s.classe}`}
                      title={`${f.cliente} — ${s.titulo} · ${f.entrega ? "entrega" : "retirada"} · total ${brl(f.total)}`}
                    >
                      <span className="festa-cliente">{f.cliente}</span>
                      {f.saldo > 0 && f.status !== "CANCELLED" && (
                        <span className="festa-saldo">{brl(f.saldo)}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <ul className="calendario-legenda">
        <li><i className="ponto festa-sem-sinal" /> sem pagamento</li>
        <li><i className="ponto festa-sinal" /> sinal recebido</li>
        <li><i className="ponto festa-paga" /> paga integralmente</li>
        <li><i className="ponto festa-cancelada" /> cancelada</li>
      </ul>
    </div>
  );
}
