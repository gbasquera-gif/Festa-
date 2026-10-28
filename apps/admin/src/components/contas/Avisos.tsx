import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MARCOS_DE_AVISO, MARCO_DE_AVISO_LABEL, type MarcoDeAviso } from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import type { SituacaoDosAvisos } from "./tipos";

const SITUACAO_DO_ENVIO: Record<SituacaoDosAvisos["envios"][number]["situacao"], { rotulo: string; classe: string }> = {
  PENDENTE: { rotulo: "Na fila", classe: "aguardando" },
  ENVIANDO: { rotulo: "Enviando", classe: "aguardando" },
  ENVIADO: { rotulo: "Enviado", classe: "quitado" },
  FALHOU: { rotulo: "Vai tentar de novo", classe: "parcial" },
  ESGOTADO: { rotulo: "Não enviado", classe: "vencido" },
  CANCELADO: { rotulo: "Cancelado", classe: "cancelado" },
  INCERTO: { rotulo: "Incerto", classe: "parcial" },
};

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * Como e quando avisar das contas: marcos, hora, e-mail e quem recebe.
 * Os avisos aparecem sempre no sino do painel; o e-mail é opcional e só vai
 * para endereço confirmado por código.
 */
export function Avisos() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SituacaoDosAvisos>({
    queryKey: ["avisos"],
    queryFn: () => api("/avisos"),
  });
  const [marcos, setMarcos] = useState<number[]>([]);
  const [hora, setHora] = useState(8);
  const [emailAtivo, setEmailAtivo] = useState(false);
  const [mostrarValor, setMostrarValor] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMarcos(data.config.marcos);
    setHora(data.config.horaDoAviso);
    setEmailAtivo(data.config.emailAtivo);
    setMostrarValor(data.config.mostrarValorNoEmail);
  }, [data]);

  const salvar = useMutation({
    mutationFn: () =>
      api("/avisos/configuracao", {
        method: "PUT",
        body: JSON.stringify({ marcos, horaDoAviso: hora, emailAtivo, mostrarValorNoEmail: mostrarValor }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["avisos"] });
      toast.success("Avisos salvos.");
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  if (isLoading) return <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Carregando…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Não foi possível carregar os avisos.</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-2" data-avisos>
      <section className="fin-cartao grid content-start gap-4">
        <h3 className="font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
          Quando avisar
        </h3>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm">Avisar</legend>
          {MARCOS_DE_AVISO.map((m) => (
            <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={marcos.includes(m)}
                onChange={(e) => setMarcos((atual) => (e.target.checked ? [...atual, m] : atual.filter((x) => x !== m)))}
              />
              {MARCO_DE_AVISO_LABEL[m as MarcoDeAviso]}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-2">
          <Label htmlFor="aviso-hora">A partir de que hora (horário de Brasília)</Label>
          <select
            id="aviso-hora"
            value={hora}
            onChange={(e) => setHora(Number(e.target.value))}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}h
              </option>
            ))}
          </select>
          <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
            A tarefa roda de hora em hora; os avisos do dia saem na primeira execução depois deste horário. Conta paga não recebe
            lembrete.
          </p>
        </div>

        <div className="grid gap-3 rounded-md border px-3 py-3">
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>Enviar também por e-mail</span>
            <Switch checked={emailAtivo} onCheckedChange={setEmailAtivo} aria-label="Enviar também por e-mail" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span>Mostrar o valor no e-mail</span>
            <Switch checked={mostrarValor} onCheckedChange={setMostrarValor} aria-label="Mostrar o valor no e-mail" />
          </label>
          <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
            O e-mail leva só a descrição, o vencimento e o link do painel. Caixa de e-mail é menos protegida que o painel: o valor
            só vai se esta opção estiver ligada.
          </p>
          {!data.email.configurado && (
            <p className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--fin-gold-pale)", color: "var(--fin-navy-ink)" }} data-email-nao-configurado>
              {data.email.motivo} Até lá, os avisos aparecem só no sino do painel.
            </p>
          )}
        </div>
        <div>
          <Button className="min-h-11" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            Salvar avisos
          </Button>
        </div>
      </section>

      <Destinatarios dados={data} />

      <section className="fin-cartao grid content-start gap-3 lg:col-span-2" data-envios>
        <h3 className="font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
          Últimos e-mails
        </h3>
        {data.envios.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Nenhum e-mail de aviso ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="fin-tabela">
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Para</th>
                  <th className="num">Avisos</th>
                  <th>Situação</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {data.envios.map((e) => (
                  <tr key={e.id}>
                    <td>{e.dia.split("-").reverse().join("/")}</td>
                    <td style={{ color: "var(--fin-muted)" }}>{e.email}</td>
                    <td className="num">{e.avisos}</td>
                    <td>
                      <span className={`fin-situacao ${SITUACAO_DO_ENVIO[e.situacao].classe}`}>{SITUACAO_DO_ENVIO[e.situacao].rotulo}</span>
                    </td>
                    <td className="text-xs" style={{ color: "var(--fin-muted)" }}>
                      {e.situacao === "ENVIADO"
                        ? `${quando(e.enviadoEm)}${e.tentativas > 1 ? ` · ${e.tentativas} tentativas` : ""}`
                        : e.situacao === "FALHOU"
                          ? `${e.ultimoErro ?? ""} · próxima ${quando(e.proximaTentativaEm)} · tentativa ${e.tentativas}`
                          : (e.ultimoErro ?? "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs" style={{ color: "var(--fin-muted)" }} data-execucoes>
          <p className="fin-rotulo mb-1">Tarefa agendada</p>
          {data.execucoes.length === 0 ? (
            <p>Ainda não rodou neste ambiente.</p>
          ) : (
            <ul className="grid gap-0.5">
              {data.execucoes.map((x) => (
                <li key={x.id}>
                  {quando(x.iniciadaEm)} ·{" "}
                  {x.sucesso === false
                    ? `falhou (${x.erro ?? "erro"})`
                    : x.sucesso
                      ? `ok · ${x.resumo?.geracao?.geradas ?? 0} conta(s) gerada(s), ${x.resumo?.notificacoesCriadas ?? 0} aviso(s), ${x.resumo?.despacho?.enviados ?? 0} e-mail(s)`
                      : "em andamento"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Destinatarios({ dados }: { dados: SituacaoDosAvisos }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["avisos"] });
  const erro = (e: Error) => toast.error(e.message);

  const adicionar = useMutation({
    mutationFn: () => api("/avisos/destinatarios", { method: "POST", body: JSON.stringify({ email, nome: nome || null }) }),
    onSuccess: () => {
      setEmail("");
      setNome("");
      atualizar();
      toast.success("Destinatário cadastrado. Envie o código para confirmar o endereço.");
    },
    onError: erro,
  });
  const enviarCodigo = useMutation({
    mutationFn: (id: string) => api(`/avisos/destinatarios/${id}/codigo`, { method: "POST" }),
    onSuccess: () => {
      atualizar();
      toast.success("Código enviado. Ele vale por 30 minutos.");
    },
    onError: erro,
  });
  const confirmar = useMutation({
    mutationFn: (id: string) =>
      api(`/avisos/destinatarios/${id}/confirmar`, { method: "POST", body: JSON.stringify({ codigo: codigos[id] ?? "" }) }),
    onSuccess: () => {
      atualizar();
      toast.success("Endereço confirmado.");
    },
    onError: erro,
  });
  const ativar = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      api(`/avisos/destinatarios/${id}`, { method: "PATCH", body: JSON.stringify({ ativo }) }),
    onSuccess: atualizar,
    onError: erro,
  });
  const remover = useMutation({
    mutationFn: (id: string) => api<{ desativado: boolean }>(`/avisos/destinatarios/${id}`, { method: "DELETE" }),
    onSuccess: (r) => {
      atualizar();
      toast.success(r.desativado ? "Já recebeu e-mail: foi desativado, e o histórico fica." : "Removido.");
    },
    onError: erro,
  });

  return (
    <section className="fin-cartao grid content-start gap-4" data-destinatarios>
      <h3 className="font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
        Quem recebe por e-mail
      </h3>
      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
        Só recebe quem confirmar o endereço com o código de 6 dígitos enviado para ele. Um e-mail digitado errado nunca recebe as
        contas da empresa.
      </p>
      {dados.destinatarios.length === 0 && <p className="text-sm">Ninguém cadastrado.</p>}
      <ul className="grid gap-3">
        {dados.destinatarios.map((d) => (
          <li key={d.id} className="rounded-md border px-3 py-2" data-destinatario={d.email}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: "var(--fin-navy-ink)" }}>
                  {d.email}
                </p>
                {d.nome && <p className="text-xs" style={{ color: "var(--fin-muted)" }}>{d.nome}</p>}
              </div>
              <span className={`fin-situacao ${!d.ativo ? "cancelado" : d.verificadoEm ? "quitado" : "parcial"}`}>
                {!d.ativo ? "Desativado" : d.verificadoEm ? "Confirmado" : "Aguardando código"}
              </span>
            </div>
            {d.ativo && !d.verificadoEm && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={!dados.email.configurado || enviarCodigo.isPending}
                  onClick={() => enviarCodigo.mutate(d.id)}
                >
                  {d.codigoEnviadoEm ? "Reenviar código" : "Enviar código"}
                </Button>
                <Input
                  aria-label={`Código de ${d.email}`}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={codigos[d.id] ?? ""}
                  onChange={(e) => setCodigos((c) => ({ ...c, [d.id]: e.target.value.replace(/\D/g, "") }))}
                  className="min-h-11 w-28"
                />
                <Button className="min-h-11" disabled={(codigos[d.id] ?? "").length !== 6 || confirmar.isPending} onClick={() => confirmar.mutate(d.id)}>
                  Confirmar
                </Button>
              </div>
            )}
            <div className="mt-1 flex flex-wrap gap-1">
              <Button variant="ghost" className="min-h-11" onClick={() => ativar.mutate({ id: d.id, ativo: !d.ativo })}>
                {d.ativo ? "Desativar" : "Reativar"}
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={() => remover.mutate(d.id)}>
                Remover
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          adicionar.mutate();
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="dest-email">E-mail</Label>
          <Input id="dest-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-11" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="dest-nome">Nome (opcional)</Label>
          <Input id="dest-nome" value={nome} onChange={(e) => setNome(e.target.value)} className="min-h-11" />
        </div>
        <Button type="submit" className="min-h-11" disabled={!email.includes("@") || adicionar.isPending}>
          Adicionar
        </Button>
      </form>
    </section>
  );
}
