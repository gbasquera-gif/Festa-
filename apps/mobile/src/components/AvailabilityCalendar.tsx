import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useOrcamento } from "@/lib/orcamento";
import { colors } from "@/theme";

interface DayAvailability {
  date: string;
  reserved: number;
  remaining: number;
  available: boolean;
  /** Itens em falta, quando o dia caiu por material e não por agenda cheia. */
  itensIndisponiveis?: { productId: string; nome: string; esgotado: boolean }[];
}

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "Sábado, 29 de agosto" — o jeito que a pessoa reconhece o dia que tocou. */
function diaPorExtenso(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${dia} de ${MONTH_LABELS[mes - 1].toLowerCase()}`;
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AvailabilityCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1)));
  /** Dia ocupado que a pessoa tocou para saber o motivo. */
  const [motivo, setMotivo] = useState<DayAvailability | null>(null);
  const { kitId, items, setProductQuantity } = useOrcamento();

  const key = monthKey(cursor);
  // A consulta carrega o que a pessoa já escolheu: "este dia está livre?"
  // depende do kit. A agenda pode ter vaga e o painel daquele tema já estar
  // reservado — e é melhor ela descobrir aqui do que depois de criar conta.
  const selecao = [
    kitId ? `kitId=${kitId}` : "",
    items.length > 0 ? `items=${items.map((i) => `${i.productId}:${i.quantity}`).join(",")}` : "",
  ]
    .filter(Boolean)
    .join("&");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["availability", key, selecao],
    queryFn: () =>
      api<DayAvailability[]>(`/availability?month=${key}${selecao ? `&${selecao}` : ""}`),
  });

  const carregou = Boolean(data);
  const byDate = new Map((data ?? []).map((d) => [d.date, d]));

  // Um item esgotado aparece como bloqueio em todos os dias, porque o
  // problema não é a data — é não existir a peça. É esse padrão que separa
  // "sem estoque" de "já saiu nesse sábado".
  const esgotados = [
    ...new Map(
      (data ?? [])
        .flatMap((d) => d.itensIndisponiveis ?? [])
        .filter((item) => item.esgotado)
        .map((item) => [item.productId, item]),
    ).values(),
  ];

  const ocupadosNoDia = (byDate.get(value)?.itensIndisponiveis ?? []).filter(
    (item) => !item.esgotado,
  );

  // Só dá para remover o que a própria cliente acrescentou. Item que vem
  // dentro do kit não é dela para tirar — ali a saída é trocar de kit.
  const removiveis = new Set(items.map((item) => item.productId));
  const podeResolverAqui = esgotados.every((item) => removiveis.has(item.productId));
  const firstWeekday = cursor.getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${key}-${String(i + 1).padStart(2, "0")}`),
  ];

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + delta, 1)));
  }

  return (
    <View className="gap-3 rounded-2xl border border-sand bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => shiftMonth(-1)} className="px-3 py-1" hitSlop={8}>
          <Text className="text-lg font-bold text-navy">‹</Text>
        </Pressable>
        <Text className="font-bold text-navy">
          {MONTH_LABELS[cursor.getUTCMonth()]} {cursor.getUTCFullYear()}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} className="px-3 py-1" hitSlop={8}>
          <Text className="text-lg font-bold text-navy">›</Text>
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((w, i) => (
          <Text key={i} className="w-[14.28%] text-center text-xs font-bold text-navy/40">
            {w}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <View key={i} className="w-[14.28%] py-1" />;

          const info = byDate.get(dateStr);
          const isPast = dateStr < todayKey;
          const isSelected = dateStr === value;
          const available = info?.available ?? false;
          // Enquanto a resposta não chega, o dia não é verde nem vermelho.
          // Antes o padrão era "disponível", então uma consulta que falhava
          // pintava o mês inteiro de verde e a recusa só vinha no fim da
          // jornada, depois de a cliente já ter criado conta.
          const desconhecido = !carregou && !isPast;
          const disabled = isPast || desconhecido;

          return (
            <View key={i} className="w-[14.28%] items-center py-1">
              <Pressable
                disabled={disabled}
                // Dia ocupado continua clicável de propósito: tocar e nada
                // acontecer não ensina nada. Aqui o toque abre o motivo, que
                // é a pergunta que a pessoa está fazendo ao tocar.
                onPress={() => (available ? onChange(dateStr) : setMotivo(info ?? null))}
                accessibilityLabel={
                  available ? undefined : `Dia ${Number(dateStr.slice(-2))} indisponível. Toque para saber o motivo.`
                }
                className={cellClass(isSelected, isPast, available, desconhecido)}
              >
                <Text className={textClass(isSelected, isPast, available)}>{Number(dateStr.slice(-2))}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {isLoading && <Text className="text-center text-xs text-navy/40">Carregando disponibilidade...</Text>}

      {/* Falha de rede precisa aparecer: sem aviso, o calendário todo apagado
          parece um mês sem nenhuma data livre — e a pessoa desiste achando
          que a Festaê está lotada. */}
      {isError && (
        <Text className="text-center text-xs font-sans-bold text-coral">
          Não conseguimos carregar as datas. Verifique a conexão e tente de novo.
        </Text>
      )}

      {/* O motivo importa: "esgotado" e "já saiu nesse dia" levam a decisões
          diferentes. Esgotado bloqueia o mês inteiro e a saída é tirar o item;
          o outro é só escolher outro dia. Sem essa distinção, a cliente ficava
          diante de um calendário vermelho sem saber o que fazer. */}
      {esgotados.length > 0 && (
        <View className="gap-2 rounded-2xl border border-coral bg-coral/5 p-3.5">
          <View className="flex-row gap-2">
            <Ionicons name="alert-circle-outline" size={18} color={colors.coral} />
            <Text className="flex-1 text-sm leading-5 text-navy">
              <Text className="font-sans-bold">
                {esgotados.length === 1
                  ? `${esgotados[0].nome} está sem estoque`
                  : `${esgotados.map((i) => i.nome).join(", ")} estão sem estoque`}
              </Text>
              {/* A frase muda conforme dá ou não para resolver ali mesmo:
                  mandar "remova o item" e logo abaixo dizer que ele vem no
                  kit deixava a cliente sem saída nenhuma. */}
              {podeResolverAqui
                ? esgotados.length === 1
                  ? " e por isso nenhuma data fica disponível. Remova o item para continuar."
                  : " e por isso nenhuma data fica disponível. Remova os itens para continuar."
                : " e por isso nenhuma data fica disponível."}
            </Text>
          </View>

          {esgotados.map((item) =>
            removiveis.has(item.productId) ? (
              <Pressable
                key={item.productId}
                onPress={() => setProductQuantity(item.productId, 0)}
                className="items-center rounded-xl bg-coral py-2.5"
                accessibilityRole="button"
              >
                <Text className="text-sm font-sans-bold text-white">Remover {item.nome}</Text>
              </Pressable>
            ) : (
              <Text key={item.productId} className="text-xs leading-5 text-navy/60">
                {item.nome} faz parte do kit escolhido. Volte e escolha outro kit, ou fale com a
                Festaê pelo WhatsApp.
              </Text>
            ),
          )}
        </View>
      )}

      {/* Era um texto cinza pequeno embaixo do calendário e passava batido:
          a pessoa via o mês vermelho e não lia o motivo. Caixa com borda,
          ícone e contraste — a mesma linguagem do aviso de item esgotado. */}
      {ocupadosNoDia.length > 0 && (
        <View className="flex-row gap-2 rounded-2xl border border-coral bg-coral/5 p-3.5">
          <Ionicons name="calendar-outline" size={18} color={colors.coral} />
          <Text className="flex-1 text-sm leading-5 text-navy">
            <Text className="font-sans-bold">
              {ocupadosNoDia.length === 1
                ? `${ocupadosNoDia[0].nome} já está reservado nesta data.`
                : `${ocupadosNoDia.map((i) => i.nome).join(", ")} já estão reservados nesta data.`}
            </Text>{" "}
            Escolha outro dia — os dias em verde estão livres para o que você montou.
          </Text>
        </View>
      )}

      {/* Aviso na tela, e não só texto embaixo do calendário: tocar num dia
          vermelho é a pergunta "por que não posso?" — a resposta precisa
          aparecer na frente, e não numa linha que se perde na página. */}
      <Modal
        visible={motivo !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMotivo(null)}
      >
        <Pressable
          onPress={() => setMotivo(null)}
          className="flex-1 items-center justify-center bg-navy/50 px-6"
        >
          {/* Pressable interno segura o toque: sem ele, tocar no próprio
              cartão fecharia o aviso junto com o fundo. */}
          <Pressable onPress={() => {}} className="w-full gap-3 rounded-3xl bg-white p-5">
            <View className="flex-row items-center gap-2">
              <Ionicons name="alert-circle" size={22} color={colors.coral} />
              <Text className="flex-1 font-sans-extrabold text-lg text-navy">
                {motivo ? diaPorExtenso(motivo.date) : ""}
              </Text>
            </View>

            {motivo && (motivo.itensIndisponiveis?.length ?? 0) > 0 ? (
              <>
                <Text className="text-base leading-6 text-navy/80">
                  {motivo.itensIndisponiveis!.some((item) => item.esgotado)
                    ? "Estes itens da sua festa estão sem estoque:"
                    : "Estes itens já estão reservados para este dia:"}
                </Text>
                {motivo.itensIndisponiveis!.map((item) => (
                  <View key={item.productId} className="flex-row items-center gap-2">
                    <Ionicons name="close-circle" size={16} color={colors.coral} />
                    <Text className="flex-1 font-sans-bold text-navy">{item.nome}</Text>
                  </View>
                ))}
                <Text className="text-sm leading-5 text-navy/60">
                  {motivo.itensIndisponiveis!.some((item) => item.esgotado)
                    ? "Enquanto eles estiverem na sua festa, nenhuma data fica disponível."
                    : "Escolha um dia em verde, ou fale com a Festaê pelo WhatsApp."}
                </Text>
              </>
            ) : (
              <Text className="text-base leading-6 text-navy/80">
                A agenda deste dia já está completa. A Festaê atende poucas festas por dia para
                entregar tudo montado com capricho — escolha um dia em verde.
              </Text>
            )}

            <Pressable
              onPress={() => setMotivo(null)}
              className="mt-1 items-center rounded-2xl bg-coral py-3.5"
              accessibilityRole="button"
            >
              <Text className="font-sans-bold text-white">Entendi</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function cellClass(selected: boolean, past: boolean, available: boolean, desconhecido = false) {
  if (selected) return "h-9 w-9 items-center justify-center rounded-full bg-coral";
  if (past) return "h-9 w-9 items-center justify-center rounded-full";
  // Estado neutro enquanto não se sabe: verde seria promessa e vermelho seria
  // mentira. Sem fundo, o dia lê como "ainda carregando".
  if (desconhecido) return "h-9 w-9 items-center justify-center rounded-full";
  return `h-9 w-9 items-center justify-center rounded-full ${available ? "bg-green-50" : "bg-red-50"}`;
}

function textClass(selected: boolean, past: boolean, available: boolean) {
  if (selected) return "text-sm font-bold text-white";
  if (past) return "text-sm font-semibold text-navy/20";
  return `text-sm font-semibold ${available ? "text-green-700" : "text-red-400"}`;
}
