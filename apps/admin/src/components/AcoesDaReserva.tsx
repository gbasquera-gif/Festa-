import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Ban,
  BadgeDollarSign,
  CalendarClock,
  PackageCheck,
  PackageOpen,
  Pencil,
  Receipt,
  SquarePen,
  Ticket,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PAYMENT_METHODS,
  diaEmChapeco,
  PAYMENT_METHOD_LABEL,
  saldoAPagar,
  splitPayment,
  type ReservationStatus,
} from "@festae/shared";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CorrigirDadosReserva } from "@/components/CorrigirDadosReserva";
import { CancelarReserva } from "@/components/credito/CancelarReserva";
import { AplicarCredito } from "@/components/credito/AplicarCredito";
import { useFormato } from "@/lib/privacidade";


/** Item que não cabe na data de destino, com a conta que a operação precisa ver. */
interface ConflitoDeData {
  produto: string;
  estoqueTotal: number;
  jaComprometido: number;
  necessario: number;
  disponivel: number;
}

/** O que a pessoa precisa digitar para a exclusão sair do lugar. */
const PALAVRA_DE_CONFIRMACAO = "EXCLUIR";

/**
 * As ações de uma reserva, na ordem do risco.
 *
 * Corrigir dados é reversível, cancelar guarda o histórico e excluir não tem
 * volta — e a tela precisa deixar essa diferença óbvia antes do toque, não
 * depois. Por isso a exclusão é vermelha, fica por último, é separada por uma
 * linha e só existe para quem é ADMIN.
 */
export function AcoesDaReserva({
  reservaId,
  cliente,
  telefone,
  endereco,
  data,
  total,
  jaPago,
  status,
  creditoAplicado = 0,
  creditoDisponivel = 0,
  festaJaChegou = false,
  onDepoisDeExcluir,
}: {
  reservaId: string;
  cliente: string;
  telefone: string | null;
  endereco: string | null;
  data: string;
  total: number;
  /** Soma dos pagamentos já recebidos. Define o valor proposto e o saldo. */
  jaPago: number;
  status: ReservationStatus;
  /** Crédito Festaê abatendo esta festa. */
  creditoAplicado?: number;
  /** Saldo de crédito Festaê da cliente, para oferecer o uso. */
  creditoDisponivel?: number;
  /** O dia da festa já chegou (ou chega amanhã): o material está saindo. */
  festaJaChegou?: boolean;
  onDepoisDeExcluir?: () => void;
}) {
  const { brl, formatarReais } = useFormato();
  const jaCancelada = status === "CANCELLED" || status === "REJECTED";
  const { user } = useAuth();
  const [, navegar] = useLocation();
  const queryClient = useQueryClient();
  const [corrigindo, setCorrigindo] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [aplicandoCredito, setAplicandoCredito] = useState(false);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [valorRecebido, setValorRecebido] = useState("");
  const [formaRecebida, setFormaRecebida] = useState("PIX");
  const [recebidoEm, setRecebidoEm] = useState("");
  const [tipoRecebido, setTipoRecebido] = useState<"DEPOSIT" | "BALANCE">("DEPOSIT");
  const [remarcando, setRemarcando] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [conflitos, setConflitos] = useState<ConflitoDeData[] | null>(null);
  /** Recusa que não é falta de material — agenda cheia, data igual à atual. */
  const [motivoRecusa, setMotivoRecusa] = useState<string | null>(null);

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    queryClient.invalidateQueries({ queryKey: ["reserva", reservaId] });
    queryClient.invalidateQueries({ queryKey: ["cliente"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["proximas-acoes"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
    queryClient.invalidateQueries({ queryKey: ["conflitos"] });
  }

  const remarcar = useMutation({
    mutationFn: () =>
      api(`/reservations/${reservaId}/data`, {
        method: "PATCH",
        body: JSON.stringify({ data: novaData }),
      }),
    onSuccess: () => {
      toast.success("Data alterada. A data antiga voltou a ficar livre na loja.");
      setRemarcando(false);
      setConflitos(null);
      setMotivoRecusa(null);
      setNovaData("");
      recarregar();
    },
    // A recusa fica dentro do diálogo, não num aviso que some sozinho: quem
    // está com a cliente na linha precisa reler o motivo enquanto escolhe
    // outro dia, e um aviso passageiro obriga a tentar de novo para lembrar.
    onError: (e) => {
      setConflitos(null);
      setMotivoRecusa(null);
      if (e instanceof ApiError && Array.isArray(e.detalhes?.conflitos)) {
        setConflitos(e.detalhes.conflitos as ConflitoDeData[]);
        return;
      }
      setMotivoRecusa(e instanceof Error ? e.message : "Não foi possível alterar a data.");
    },
  });

  // Crédito Festaê aplicado já cobre parte da festa: o saldo a receber é o
  // que sobra depois dele e dos pagamentos.
  const saldo = saldoAPagar(total, jaPago + creditoAplicado);

  /**
   * O valor que a operação provavelmente vai digitar, por tipo.
   *
   * Sinal é a fração combinada do total; saldo é o que falta. Propor o total
   * inteiro como "sinal" faria a pessoa apagar e redigitar toda vez — e o
   * campo já vem selecionado, então um número errado é um número que entra
   * por descuido.
   */
  function valorSugerido(tipo: "DEPOSIT" | "BALANCE") {
    const proposto = tipo === "DEPOSIT" ? Math.min(splitPayment(total).deposit, saldo) : saldo;
    return proposto > 0 ? proposto.toFixed(2) : "";
  }

  function escolherTipo(tipo: "DEPOSIT" | "BALANCE") {
    setTipoRecebido(tipo);
    setValorRecebido(valorSugerido(tipo));
    setMotivoRecusa(null);
  }

  function abrirRegistro() {
    // Sem nada pago, o que entra é o sinal. Com sinal já recebido, o que
    // falta é o saldo — que é o outro momento em que dinheiro chega.
    const tipo = jaPago > 0 ? "BALANCE" : "DEPOSIT";
    setTipoRecebido(tipo);
    setValorRecebido(valorSugerido(tipo));
    setFormaRecebida("PIX");
    setRecebidoEm(diaEmChapeco(new Date()));
    setMotivoRecusa(null);
    setRegistrando(true);
  }

  const registrarPagamento = useMutation({
    mutationFn: () =>
      api<{ pago: number; saldo: number; reservaConfirmada: boolean }>(
        `/reservations/${reservaId}/pagamentos`,
        {
          method: "POST",
          body: JSON.stringify({
            tipo: tipoRecebido,
            valor: Number(valorRecebido),
            forma: formaRecebida,
            recebidoEm: recebidoEm || undefined,
          }),
        },
      ),
    onSuccess: (r) => {
      toast.success(
        r.reservaConfirmada
          ? "Pagamento registrado. A reserva está confirmada."
          : r.saldo > 0
            ? `Pagamento registrado. Saldo restante de ${brl(r.saldo)}.`
            : "Pagamento registrado. A festa está paga integralmente.",
      );
      setRegistrando(false);
      recarregar();
    },
    onError: (e) =>
      setMotivoRecusa(e instanceof Error ? e.message : "Não foi possível registrar o pagamento."),
  });

  const aguardarDevolucao = useMutation({
    mutationFn: () =>
      api(`/reservations/${reservaId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "AGUARDANDO_DEVOLUCAO" }),
      }),
    onSuccess: () => {
      toast.success("Marcada como aguardando devolução. O material continua reservado.");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível mudar a etapa."),
  });

  const confirmarDevolucao = useMutation({
    mutationFn: () => api(`/reservations/${reservaId}/devolucao`, { method: "PATCH" }),
    onSuccess: () => {
      toast.success("Devolução confirmada. A reserva está concluída.");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível confirmar a devolução."),
  });

  const excluir = useMutation({
    mutationFn: () =>
      api<{ pagamentosApagados: number; clienteRemovido: string | null }>(
        `/reservations/${reservaId}`,
        { method: "DELETE" },
      ),
    onSuccess: (r) => {
      toast.success(
        `Reserva excluída.${r.clienteRemovido ? ` A ficha de ${r.clienteRemovido} saiu junto.` : ""}`,
      );
      setConfirmandoExcluir(false);
      setDigitado("");
      recarregar();
      onDepoisDeExcluir?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir."),
  });

  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-sm font-bold text-navy">Ações</h3>

      <div className="flex flex-col gap-2">
        {/* O comprovante encabeça a lista porque é a ação que a cliente está
            esperando do outro lado: assim que o sinal cai, alguém precisa
            mandar o papel. As outras ações são para quando algo muda. */}
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => navegar(`/reservas/${reservaId}/comprovante`)}
        >
          <Receipt className="mr-2 size-4" />
          Comprovante do sinal
        </Button>

        {/* A edição completa vem logo depois porque é o que a operação procura
            quando a cliente muda de ideia: data, kit, itens e valores numa
            tela só. As ações abaixo são atalhos para os casos estreitos. */}
        <Button
          variant="outline"
          className="justify-start"
          disabled={jaCancelada}
          onClick={() => navegar(`/reservas/${reservaId}/editar`)}
        >
          <SquarePen className="mr-2 size-4" />
          Editar reserva completa
        </Button>

        {/* Registrar recebimento é confirmação financeira manual: só ADMIN.
            O comprovante depende de dinheiro que entrou, e a reserva só
            confirma quando o sinal é registrado. */}
        {user?.role === "ADMIN" && (
          <Button
            variant="outline"
            className="justify-start"
            disabled={jaCancelada}
            onClick={abrirRegistro}
            data-registrar-pagamento
          >
            <BadgeDollarSign className="mr-2 size-4" />
            Registrar pagamento recebido
          </Button>
        )}

        <Button variant="outline" className="justify-start" onClick={() => setCorrigindo(true)}>
          <Pencil className="mr-2 size-4" />
          Corrigir contato e observações
        </Button>

        {/* Remarcar é o pedido mais comum depois que a festa já está fechada:
            a cliente muda o dia e, sem esta ação, a saída seria cancelar e
            lançar de novo — perdendo pagamento, histórico e checklist. */}
        <Button
          variant="outline"
          className="justify-start"
          disabled={jaCancelada}
          onClick={() => {
            setConflitos(null);
            setMotivoRecusa(null);
            setRemarcando(true);
          }}
        >
          <CalendarClock className="mr-2 size-4" />
          Alterar data da festa
        </Button>

        {/* Crédito Festaê só aparece quando a cliente tem e a festa ainda
            tem o que pagar: botão que não leva a lugar nenhum é ruído. */}
        {!jaCancelada && creditoDisponivel > 0 && saldo > 0 && (
          <Button variant="outline" className="justify-start" onClick={() => setAplicandoCredito(true)}>
            <Ticket className="mr-2 size-4" />
            Aplicar crédito Festaê ({formatarReais(creditoDisponivel)})
          </Button>
        )}

        {/* A devolução tem dois passos visíveis: o material saiu e ainda não
            voltou; voltou e a festa fecha. Concluir direto pelo seletor de
            etapa continua valendo para quem não precisa do meio-termo. */}
        {status === "AGUARDANDO_DEVOLUCAO" ? (
          <Button
            className="justify-start"
            disabled={confirmarDevolucao.isPending}
            onClick={() => confirmarDevolucao.mutate()}
          >
            <PackageCheck className="mr-2 size-4" />
            {confirmarDevolucao.isPending ? "Confirmando..." : "Confirmar devolução e concluir"}
          </Button>
        ) : (
          festaJaChegou &&
          (status === "CONFIRMED" || status === "PREPARING" || status === "READY") && (
            <Button
              variant="outline"
              className="justify-start"
              disabled={aguardarDevolucao.isPending}
              onClick={() => aguardarDevolucao.mutate()}
            >
              <PackageOpen className="mr-2 size-4" />
              Marcar como aguardando devolução
            </Button>
          )
        )}

        <Button
          variant="outline"
          className="justify-start"
          disabled={jaCancelada}
          onClick={() => setConfirmandoCancelar(true)}
        >
          <Ban className="mr-2 size-4" />
          {jaCancelada ? "Reserva já cancelada" : "Cancelar reserva"}
        </Button>

        {/* Só o dono apaga. Cancelar desfaz a venda guardando o histórico;
            excluir apaga a festa inteira e não tem volta — não é tarefa de
            operação do dia a dia, e o botão nem aparece para quem não pode. */}
        {user?.role === "ADMIN" && (
          <>
            <div className="mt-1 border-t pt-3">
              <Button
                variant="outline"
                className="w-full justify-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmandoExcluir(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Excluir definitivamente
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Para lançamentos de teste ou feitos por engano. Não tem volta.
              </p>
            </div>
          </>
        )}
      </div>

      {corrigindo && (
        <CorrigirDadosReserva
          reservaId={reservaId}
          cliente={cliente}
          telefone={telefone}
          endereco={endereco}
          aberto
          onFechar={() => setCorrigindo(false)}
        />
      )}

      {/* Registrar pagamento: o caminho para o dinheiro que entrou por fora do
          aplicativo — Pix na chave, transferência, dinheiro na retirada. Não
          reescreve pagamento nenhum; acrescenta o que chegou. */}
      <Dialog
        open={registrando}
        onOpenChange={(v) => {
          if (!v) {
            setRegistrando(false);
            setMotivoRecusa(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Festa de <strong className="text-navy">{cliente}</strong> em {data}. Total{" "}
              {brl(total)} · já recebido {brl(jaPago)} ·{" "}
              {creditoAplicado > 0 && <>crédito Festaê {brl(creditoAplicado)} · </>}
              <strong className="text-navy">saldo {brl(saldo)}</strong>.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label>O que foi recebido</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["DEPOSIT", "Sinal (garante a data)"],
                    ["BALANCE", "Saldo (na retirada ou entrega)"],
                  ] as const
                ).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => escolherTipo(valor)}
                    className={`min-h-11 rounded-full border px-4 py-2 text-sm transition ${
                      tipoRecebido === valor
                        ? "border-navy bg-navy text-white"
                        : "border-input hover:bg-muted"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Valor recebido</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={valorRecebido}
                  onChange={(e) => {
                    setValorRecebido(e.target.value);
                    setMotivoRecusa(null);
                  }}
                  placeholder="0,00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Forma</Label>
                <select
                  className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:h-9"
                  value={formaRecebida}
                  onChange={(e) => setFormaRecebida(e.target.value)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Quando entrou</Label>
              <Input
                type="date"
                value={recebidoEm}
                onChange={(e) => setRecebidoEm(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A data em que o dinheiro entrou, não a de hoje — é ela que sai no comprovante.
              </p>
            </div>

            {Number(valorRecebido) > saldo && saldo > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Esse valor é maior que o saldo de {brl(saldo)}. Registre assim mesmo se a cliente
                pagou a mais — o comprovante mostra saldo zerado, nunca negativo.
              </p>
            )}

            {motivoRecusa && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {motivoRecusa}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              O pagamento é acrescentado ao histórico; nada do que já foi registrado é alterado.
              {jaPago === 0 && " Com o sinal registrado, a reserva passa a confirmada."}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                setRegistrando(false);
                setMotivoRecusa(null);
              }}
            >
              Voltar
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!Number(valorRecebido) || registrarPagamento.isPending}
              onClick={() => registrarPagamento.mutate()}
            >
              {registrarPagamento.isPending ? "Registrando..." : "Registrar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remarcar: a data de destino passa pelas mesmas conferências de uma
          reserva nova. Quando não cabe, a tela mostra a conta em vez de um
          "erro" seco — quem está com a cliente na linha precisa saber se o
          problema é agenda cheia ou material, para propor outro dia. */}
      <Dialog
        open={remarcando}
        onOpenChange={(v) => {
          if (!v) {
            setRemarcando(false);
            setConflitos(null);
            setMotivoRecusa(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar a data da festa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hoje marcada para <strong className="text-navy">{data}</strong>. O pagamento, o
              histórico e o checklist ficam como estão — só a data muda.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label>Nova data</Label>
              <Input
                type="date"
                value={novaData}
                onChange={(e) => {
                  setNovaData(e.target.value);
                  setConflitos(null);
                  setMotivoRecusa(null);
                }}
              />
            </div>

            {motivoRecusa && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {motivoRecusa}
              </div>
            )}

            {conflitos && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
                <p className="font-semibold text-red-900">Falta material nessa data</p>
                {conflitos.map((c) => (
                  <p key={c.produto} className="mt-1 text-red-800">
                    <strong>{c.produto}</strong>: acervo {c.estoqueTotal} · já comprometido{" "}
                    {c.jaComprometido} · disponível {c.disponivel} · esta festa precisa de{" "}
                    {c.necessario}
                  </p>
                ))}
                <p className="mt-2 text-red-800">Escolha outro dia ou remarque a outra festa.</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              A data antiga volta a ficar livre na loja assim que você salvar. Se a cliente já
              adicionou a festa ao calendário do celular, o arquivo antigo continua com a data
              velha — vale reenviar.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                setRemarcando(false);
                setConflitos(null);
                setMotivoRecusa(null);
              }}
            >
              Voltar
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!novaData || remarcar.isPending}
              onClick={() => remarcar.mutate()}
            >
              {remarcar.isPending ? "Alterando..." : "Alterar data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar: motivo e destino do valor pago. Depois de gerar crédito,
          o próprio diálogo oferece o voucher e a mensagem para a cliente. */}
      <CancelarReserva
        reservaId={reservaId}
        cliente={cliente}
        data={data}
        total={total}
        jaPago={jaPago}
        creditoAplicado={creditoAplicado}
        aberto={confirmandoCancelar}
        aoFechar={() => setConfirmandoCancelar(false)}
        aoCancelar={recarregar}
      />

      {aplicandoCredito && (
        <AplicarCredito
          reservaId={reservaId}
          cliente={cliente}
          total={total}
          jaPago={jaPago}
          creditoAplicado={creditoAplicado}
          saldoDaCliente={creditoDisponivel}
          aberto
          aoFechar={() => setAplicandoCredito(false)}
          aoAplicar={recarregar}
        />
      )}

      {/* Excluir: duas etapas. A primeira diz o que some; a segunda exige
          digitar a palavra, para o toque errado num celular não apagar uma
          festa de verdade. */}
      <Dialog
        open={confirmandoExcluir}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmandoExcluir(false);
            setDigitado("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Excluir definitivamente?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Some do sistema a festa de <strong>{cliente}</strong> em <strong>{data}</strong>, com
              o pedido, os itens, os pagamentos registrados ({brl(total)}) e o checklist.
            </p>
            <p>
              A data e o material voltam a ficar livres, e a reserva sai da lista, das Próximas
              Ações e dos indicadores.
            </p>
            <p className="font-medium text-destructive">
              Não tem como desfazer. Para desfazer uma venda de verdade, use "Cancelar reserva" —
              ali o histórico fica.
            </p>

            <div className="flex flex-col gap-1.5 pt-1">
              <Label>
                Digite <span className="font-mono font-bold">{PALAVRA_DE_CONFIRMACAO}</span> para
                confirmar
              </Label>
              <Input
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                placeholder={PALAVRA_DE_CONFIRMACAO}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                setConfirmandoExcluir(false);
                setDigitado("");
              }}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={digitado.trim().toUpperCase() !== PALAVRA_DE_CONFIRMACAO || excluir.isPending}
              onClick={() => excluir.mutate()}
            >
              {excluir.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
