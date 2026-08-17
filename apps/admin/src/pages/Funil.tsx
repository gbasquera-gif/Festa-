import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

const ROTULOS: Record<string, string> = {
  VISITA_LOJA: "Chegaram na loja",
  ESCOLHA_TEMA: "Escolheram um tema",
  ESCOLHA_KIT: "Escolheram um kit",
  CADASTRO: "Criaram conta",
  RESERVA_CRIADA: "Reservaram",
  PAGAMENTO_INICIADO: "Abriram o Pix",
  PAGAMENTO_REALIZADO: "Pagaram o sinal",
};

interface Resumo {
  windowDays: number;
  funnel: { type: string; count: number; dropoffRate: number | null }[];
  placar: {
    visitas: number;
    reservas: number;
    pagas: number;
    conversaoVisitaReserva: number | null;
    conversaoReservaPagamento: number | null;
    ticketMedio: number | null;
    receita: number;
  };
  origens: {
    origem: string;
    campanha: string | null;
    visitas: number;
    reservas: number;
    pagas: number;
    receita: number;
  }[];
}

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Número grande com legenda — o que se lê de longe. */
function Placar({
  label,
  valor,
  detalhe,
}: {
  label: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-extrabold text-navy">{valor}</p>
        {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * O placar da loja.
 *
 * Existe para responder cinco perguntas numa olhada: entrou gente, de onde
 * veio, quantas montaram, quantas reservaram e quantas pagaram. Nada além
 * disso — enquanto o volume for de dezenas, gráfico não acrescenta nada que
 * o número puro já não diga.
 */
export default function Funil() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => api<Resumo>("/analytics/summary"),
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data) return <p className="text-muted-foreground">Não foi possível carregar os números.</p>;

  const { placar, origens, funnel } = data;
  const pct = (valor: number | null) => (valor === null ? "—" : `${valor}%`);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Funil da loja</h1>
      <p className="mb-6 text-muted-foreground">
        Últimos {data.windowDays} dias. Quem chegou, de onde veio e quanto virou reserva paga.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Placar label="Chegaram na loja" valor={String(placar.visitas)} />
        <Placar
          label="Reservaram"
          valor={String(placar.reservas)}
          detalhe={`${pct(placar.conversaoVisitaReserva)} de quem chegou`}
        />
        <Placar
          label="Pagaram o sinal"
          valor={String(placar.pagas)}
          detalhe={`${pct(placar.conversaoReservaPagamento)} de quem reservou`}
        />
        <Placar
          label="Ticket médio"
          valor={placar.ticketMedio === null ? "—" : brl(placar.ticketMedio)}
          detalhe={placar.receita > 0 ? `${brl(placar.receita)} no total` : "nenhuma festa paga ainda"}
        />
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy">De onde vieram</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Origem</TableHead>
            <TableHead>Campanha</TableHead>
            <TableHead className="text-right">Visitas</TableHead>
            <TableHead className="text-right">Reservas</TableHead>
            <TableHead className="text-right">Pagas</TableHead>
            <TableHead className="text-right">Receita</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {origens.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                Nenhuma visita ainda. Publique o link com <code>?utm_source=</code> para a origem
                aparecer aqui.
              </TableCell>
            </TableRow>
          )}
          {origens.map((o) => (
            <TableRow key={o.origem}>
              <TableCell className="font-medium">{o.origem}</TableCell>
              <TableCell className="text-muted-foreground">{o.campanha ?? "—"}</TableCell>
              <TableCell className="text-right">{o.visitas}</TableCell>
              <TableCell className="text-right">{o.reservas}</TableCell>
              <TableCell className="text-right">{o.pagas}</TableCell>
              <TableCell className="text-right">{o.receita > 0 ? brl(o.receita) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h2 className="mb-2 mt-8 text-lg font-bold text-navy">Passo a passo</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Etapa</TableHead>
            <TableHead className="text-right">Quantidade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {funnel.map((f) => (
            <TableRow key={f.type}>
              <TableCell>{ROTULOS[f.type] ?? f.type}</TableCell>
              <TableCell className="text-right font-medium">{f.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Sem este aviso o número engana: dá para abrir vários kits na mesma
          visita, e aí "escolheram um kit" fica maior que "escolheram um tema"
          e parece erro do sistema. Reservas e pagamentos, no topo da tela,
          são contados por festa e não têm esse problema. */}
      <p className="mt-3 text-xs text-muted-foreground">
        O passo a passo conta cliques, não pessoas: a mesma visita pode abrir vários temas e kits.
        Use-o para ver onde as pessoas param, não como número exato. Os cartões de cima contam
        festas de verdade.
      </p>
    </div>
  );
}
