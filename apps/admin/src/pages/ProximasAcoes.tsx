import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, ChevronDown, ChevronRight, Pencil, Phone } from "lucide-react";
import {
  RESERVATION_TASK_LABELS,
  SITUACAO_LABELS,
  saleChannelLabel,
  type ReservationTaskKey,
  type Situacao,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { api, baixarArquivo } from "@/lib/api";
import { CorrigirDadosReserva } from "@/components/CorrigirDadosReserva";

interface Festa {
  reservaId: string;
  data: string;
  dias: number;
  cliente: string;
  telefone: string | null;
  tema: string | null;
  tipo: string;
  status: string;
  origem: string;
  entrega: boolean;
  montagem: boolean;
  endereco: string | null;
  cidade: string;
  total: number;
  pago: number;
  saldo: number;
  etapa: { stage: string; titulo: string; acoes: string[] };
  tarefasFeitas: string[];
  tarefasAbertas: string[];
  pendencias: string[];
  situacao: Situacao;
}

interface Radar {
  hoje: Festa[];
  tresDias: Festa[];
  seteDias: Festa[];
  trintaDias: Festa[];
  devolucoesPendentes: Festa[];
  resumo: {
    hoje: number;
    entregasHoje: number;
    retiradasHoje: number;
    montagensHoje: number;
    devolucoesPendentes: number;
    atrasadas: number;
    urgentes: number;
    comPendencia: number;
  };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Quatro cores e nada mais.
 *
 * A tela é lida de relance por quem está com as mãos ocupadas. Cada cor extra
 * é uma decisão a mais que a pessoa precisa tomar antes de agir.
 */
const CORES: Record<Situacao, string> = {
  NORMAL: "border-l-emerald-500",
  ATENCAO: "border-l-amber-400",
  URGENTE: "border-l-orange-500",
  ATRASADO: "border-l-red-600",
};

const PONTOS: Record<Situacao, string> = {
  NORMAL: "bg-emerald-500",
  ATENCAO: "bg-amber-400",
  URGENTE: "bg-orange-500",
  ATRASADO: "bg-red-600",
};

const TODAS_AS_TAREFAS = Object.keys(RESERVATION_TASK_LABELS) as ReservationTaskKey[];

function quandoTexto(dias: number) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias < 0) return `há ${Math.abs(dias)} dia${Math.abs(dias) > 1 ? "s" : ""}`;
  return `em ${dias} dias`;
}

function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function CartaoDaFesta({ festa }: { festa: Festa }) {
  const [aberto, setAberto] = useState(festa.situacao === "URGENTE" || festa.situacao === "ATRASADO");
  const [corrigindo, setCorrigindo] = useState(false);
  const queryClient = useQueryClient();

  const marcar = useMutation({
    mutationFn: ({ key, done }: { key: string; done: boolean }) =>
      api(`/operacao/reservas/${festa.reservaId}/tarefas`, {
        method: "PATCH",
        body: JSON.stringify({ key, done }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proximas-acoes"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  async function baixarCalendario() {
    try {
      await baixarArquivo(
        `/operacao/reservas/${festa.reservaId}/calendario.ics`,
        `festae-${festa.cliente.replace(/\s+/g, "-").toLowerCase()}.ics`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo.");
    }
  }

  return (
    <Card className={`border-l-4 ${CORES[festa.situacao]}`}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`size-2 shrink-0 rounded-full ${PONTOS[festa.situacao]}`} />
              <p className="font-semibold break-words text-navy">{festa.cliente}</p>
              <span className="text-xs text-muted-foreground">
                {SITUACAO_LABELS[festa.situacao]}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {dataCurta(festa.data)} · {quandoTexto(festa.dias)} · {festa.etapa.titulo}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {festa.tema ?? "sem tema"} ·{" "}
              {festa.entrega ? "Entrega" : "Retirada"}
              {festa.montagem && " + montagem"} · {saleChannelLabel(festa.origem)}
              {festa.saldo > 0 && ` · saldo ${brl(festa.saldo)}`}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {festa.telefone && (
              <Button asChild size="icon" variant="ghost" className="size-11" title="Abrir no WhatsApp">
                <a
                  href={`https://wa.me/55${festa.telefone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone className="size-4" />
                </a>
              </Button>
            )}
            <Button size="icon" variant="ghost" className="size-11" onClick={baixarCalendario} title="Adicionar ao calendário">
              <CalendarPlus className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-11" onClick={() => setCorrigindo(true)} title="Corrigir dados">
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-11" onClick={() => setAberto((v) => !v)} title="Checklist e detalhes">
              {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          </div>
        </div>

        {/* Pendência aparece sempre, aberta ou fechada: é o que faz a pessoa
            decidir abrir o cartão. Escondê-la derrotaria o propósito. */}
        {festa.pendencias.length > 0 && (
          <ul className="mt-3 space-y-1">
            {festa.pendencias.map((p) => (
              <li key={p} className="text-xs font-medium text-red-700">
                • {p}
              </li>
            ))}
          </ul>
        )}

        {aberto && (
          <div className="mt-4 grid gap-4 border-t pt-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O que fazer nesta etapa
              </p>
              <ul className="space-y-1 text-sm">
                {festa.etapa.acoes.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
              {festa.entrega && festa.endereco && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {festa.endereco} — {festa.cidade}
                </p>
              )}
              {festa.telefone && (
                <p className="mt-1 text-sm text-muted-foreground">{festa.telefone}</p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                Total {brl(festa.total)} · pago {brl(festa.pago)}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Checklist
              </p>
              <div className="space-y-1.5">
                {TODAS_AS_TAREFAS.map((key) => {
                  const feita = festa.tarefasFeitas.includes(key);
                  const cobrada = festa.tarefasAbertas.includes(key);
                  return (
                    <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                      <Checkbox
                        checked={feita}
                        disabled={marcar.isPending}
                        onCheckedChange={(v) => marcar.mutate({ key, done: v === true })}
                      />
                      <span
                        className={
                          feita
                            ? "text-muted-foreground line-through"
                            : cobrada
                              ? "font-medium text-navy"
                              : "text-muted-foreground"
                        }
                      >
                        {RESERVATION_TASK_LABELS[key]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {corrigindo && (
        <CorrigirDadosReserva
          reservaId={festa.reservaId}
          cliente={festa.cliente}
          telefone={festa.telefone}
          endereco={festa.endereco}
          aberto
          onFechar={() => setCorrigindo(false)}
        />
      )}
    </Card>
  );
}

function Secao({ titulo, festas, vazio }: { titulo: string; festas: Festa[]; vazio: string }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-navy">
        {titulo} {festas.length > 0 && <span className="text-muted-foreground">({festas.length})</span>}
      </h2>
      {festas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <div className="space-y-3">
          {festas.map((f) => (
            <CartaoDaFesta key={f.reservaId} festa={f} />
          ))}
        </div>
      )}
    </section>
  );
}

function Numero({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-extrabold ${alerta && valor > 0 ? "text-red-600" : "text-navy"}`}>
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * A tela que responde "o que eu preciso fazer hoje?".
 *
 * A informação sempre esteve no banco — o que faltava era ela vir sozinha.
 * Antes, a festa de daqui a três semanas só aparecia se alguém lembrasse de
 * procurar; aqui ela chega na tela quando entra no prazo, com o que precisa
 * ser feito escrito ao lado.
 */
export default function ProximasAcoes() {
  const { data, isLoading } = useQuery({
    queryKey: ["proximas-acoes"],
    queryFn: () => api<Radar>("/operacao/proximas-acoes"),
    // A operação deixa esta tela aberta o dia todo enquanto trabalha.
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data) return <p className="text-muted-foreground">Não foi possível carregar a operação.</p>;

  const { resumo } = data;
  const tudoVazio =
    data.hoje.length +
      data.tresDias.length +
      data.seteDias.length +
      data.trintaDias.length +
      data.devolucoesPendentes.length ===
    0;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Próximas ações</h1>
      <p className="mb-6 text-muted-foreground">
        O que precisa ser feito, e quando. Nenhuma festa depende de alguém lembrar.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Numero label="Festas hoje" valor={resumo.hoje} />
        <Numero label="Entregas hoje" valor={resumo.entregasHoje} />
        <Numero label="Montagens hoje" valor={resumo.montagensHoje} />
        <Numero label="Atrasadas" valor={resumo.atrasadas} alerta />
        <Numero label="Urgentes" valor={resumo.urgentes} alerta />
        <Numero label="Devoluções" valor={resumo.devolucoesPendentes} alerta />
      </div>

      {tudoVazio && (
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
          Nenhuma festa nos próximos 30 dias. Quando houver, ela aparece aqui sozinha.
        </p>
      )}

      {data.devolucoesPendentes.length > 0 && (
        <Secao
          titulo="Devoluções pendentes"
          festas={data.devolucoesPendentes}
          vazio=""
        />
      )}
      <Secao titulo="Hoje" festas={data.hoje} vazio="Nenhuma festa hoje." />
      <Secao titulo="Próximos 3 dias" festas={data.tresDias} vazio="Nada nos próximos 3 dias." />
      <Secao titulo="Próximos 7 dias" festas={data.seteDias} vazio="Nada nos próximos 7 dias." />
      <Secao
        titulo="Próximos 30 dias"
        festas={data.trintaDias}
        vazio="Nada mais entrando no radar este mês."
      />
    </div>
  );
}
