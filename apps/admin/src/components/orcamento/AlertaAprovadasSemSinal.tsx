import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Clock, Hourglass } from "lucide-react";
import { formatarDataDaFesta, textoDoAguardo } from "@festae/shared";
import { api } from "@/lib/api";
import { useFormato } from "@/lib/privacidade";

/**
 * Propostas aprovadas aguardando o sinal além do prazo do alerta.
 *
 * Só informa. A proposta aprovada segura as peças da opção escolhida, e o
 * sinal pode ter entrado por Pix direto na conta sem ter sido lançado: quem
 * decide é a equipe, depois de conferir o extrato e falar com a cliente,
 * pelos fluxos que já existem na proposta. Aqui não há botão que cancele,
 * converta, libere peça ou mexa em pagamento.
 */

export type AprovadaSemSinal = {
  id: string;
  numero: number;
  cliente: string;
  festaEm: string | null;
  aprovadoEm: string | null;
  aprovadaPor: "CLIENTE" | "EQUIPE";
  opcao: string | null;
  valorAprovado: number;
  sinalEsperado: number;
  horasAguardando: number | null;
  diasAteAFesta: number | null;
  festaJaPassou: boolean;
};

type Resposta = { limiarHoras: number; conferidoEm: string; propostas: AprovadaSemSinal[] };

const AMBAR = "#9a6a1f";

function quandoEaFesta(p: AprovadaSemSinal): string {
  if (!p.festaEm) return "festa sem data definida";
  const data = formatarDataDaFesta(`${p.festaEm}T12:00:00.000Z`);
  if (p.festaJaPassou) return `festa em ${data} — a data já passou`;
  if (p.diasAteAFesta === 0) return `festa hoje, ${data}`;
  return `festa em ${data} (em ${p.diasAteAFesta} ${p.diasAteAFesta === 1 ? "dia" : "dias"})`;
}

export function AlertaAprovadasSemSinal({ contexto }: { contexto: "orcamentos" | "operacao" }) {
  const { brl } = useFormato();
  const { data } = useQuery<Resposta>({
    queryKey: ["orcamentos", "alertas", "aprovadas-sem-sinal"],
    queryFn: () => api("/orcamentos/alertas/aprovadas-sem-sinal"),
    staleTime: 60_000,
  });
  // Sem permissão, erro ou nada em alerta: o painel segue sem o quadro.
  if (!data || data.propostas.length === 0) return null;

  const n = data.propostas.length;
  return (
    <section
      className="painel-cartao space-y-3 p-4"
      style={{ borderColor: AMBAR }}
      data-alerta-aprovadas={contexto}
      aria-labelledby="alerta-aprovadas-titulo"
    >
      <header className="space-y-1">
        <h2 id="alerta-aprovadas-titulo" className="flex items-center gap-2 text-[0.95rem] font-semibold" style={{ color: AMBAR }}>
          <Hourglass className="size-4 shrink-0" aria-hidden />
          {n} {n === 1 ? "proposta aprovada aguarda" : "propostas aprovadas aguardam"} o sinal há mais de{" "}
          {data.limiarHoras} {data.limiarHoras === 1 ? "hora" : "horas"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Cada uma segura as peças da opção escolhida até virar reserva. Antes de decidir, confira o extrato: o sinal
          pode ter sido pago por Pix direto na conta e ainda não lançado. Nada aqui cancela, converte ou libera peças.
        </p>
      </header>

      <ul className="divide-y rounded-md border bg-background">
        {data.propostas.map((p) => (
          <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 p-3" data-aprovada-sem-sinal={p.numero}>
            <div className="min-w-0 space-y-0.5 text-sm">
              <p style={{ color: "var(--color-navy)" }}>
                <strong className="font-semibold">Proposta nº {p.numero}</strong> · {p.cliente}
                {p.opcao ? <span className="text-muted-foreground"> · {p.opcao}</span> : null}
              </p>
              <p className="text-muted-foreground">
                {quandoEaFesta(p)} · aprovada {p.aprovadaPor === "EQUIPE" ? "pela equipe" : "pela cliente no link"}
              </p>
              <p className="text-muted-foreground">
                Sinal esperado <span className="fin-numero">{brl(p.sinalEsperado)}</span> de{" "}
                <span className="fin-numero">{brl(p.valorAprovado)}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: `${AMBAR}14`, color: AMBAR }}
                data-aguardando-horas={p.horasAguardando ?? ""}
              >
                <Clock className="size-3.5" aria-hidden />
                aguardando há {textoDoAguardo(p.horasAguardando)}
              </span>
              <Link href={`/comercial/orcamentos/${p.id}`} className="text-sm underline" style={{ color: "var(--color-navy)" }}>
                Abrir proposta
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Na proposta: registre o sinal recebido ou, se a cliente não for seguir, marque como perdida — as peças ficam
        livres. O prazo do alerta se ajusta em{" "}
        <Link href="/comercial/conteudo" className="underline">
          Conteúdo da proposta → Pagamento
        </Link>
        .
      </p>
    </section>
  );
}
