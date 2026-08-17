import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

interface ItemDaData {
  productId: string;
  produto: string;
  estoque: number;
  comprometido: number;
  disponivel: number;
  situacao: "conflito" | "risco";
}

interface DataComProblema {
  data: string;
  reservas: { id: string; cliente: string; telefone: string | null; status: string }[];
  itens: ItemDaData[];
}

const ETAPA: Record<string, string> = {
  PENDING: "Solicitação",
  CONFIRMED: "Confirmada",
  PREPARING: "Separando",
  READY: "Pronta",
  COMPLETED: "Concluída",
};

function dataLonga(iso: string) {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Onde o material vai faltar.
 *
 * A loja já recusa a reserva que não cabe no acervo, mas essa trava era
 * invisível para quem opera: a venda simplesmente não acontecia. Esta tela é
 * o outro lado da mesma regra — mostra o que está segurado, para a Maria
 * Luiza decidir antes do dia chegar (comprar, alugar de parceiro, ou ligar
 * para a cliente e trocar o kit).
 *
 * Mostra "risco" junto com "conflito" de propósito: saber que sobrou uma
 * unidade para o sábado ainda dá tempo de agir; saber depois que estourou,
 * não.
 */
export default function Disponibilidade() {
  const { data, isLoading } = useQuery({
    queryKey: ["conflitos"],
    queryFn: () => api<DataComProblema[]>("/availability/conflitos"),
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  const conflitos = data?.filter((d) => d.itens.some((i) => i.situacao === "conflito")) ?? [];
  const riscos = data?.filter((d) => !d.itens.some((i) => i.situacao === "conflito")) ?? [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Disponibilidade de material</h1>
      <p className="mb-6 text-muted-foreground">
        Datas em que algum item está no limite ou já passou do estoque cadastrado.
      </p>

      {data?.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma data com item apertado. Todas as reservas cabem no acervo.
          </CardContent>
        </Card>
      )}

      {conflitos.length > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {conflitos.length === 1
            ? "1 data com item faltando. Resolva antes de confirmar as reservas."
            : `${conflitos.length} datas com item faltando. Resolva antes de confirmar as reservas.`}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {[...conflitos, ...riscos].map((dia) => {
          const temConflito = dia.itens.some((i) => i.situacao === "conflito");
          return (
            <Card key={dia.data} className={temConflito ? "border-red-300" : "border-amber-300"}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {temConflito ? (
                    <AlertTriangle className="size-4 text-red-600" />
                  ) : (
                    <TriangleAlert className="size-4 text-amber-600" />
                  )}
                  <span className="capitalize">{dataLonga(dia.data)}</span>
                  <Badge variant={temConflito ? "destructive" : "secondary"}>
                    {temConflito ? "Falta material" : "No limite"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Estoque</TableHead>
                      <TableHead className="text-right">Comprometido</TableHead>
                      <TableHead className="text-right">Disponível</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dia.itens.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell className="font-medium">{item.produto}</TableCell>
                        <TableCell className="text-right">{item.estoque}</TableCell>
                        <TableCell className="text-right">{item.comprometido}</TableCell>
                        <TableCell
                          className={`text-right font-bold ${
                            item.disponivel < 0 ? "text-red-600" : "text-amber-600"
                          }`}
                        >
                          {item.disponivel}
                        </TableCell>
                        <TableCell>
                          {/* Três situações diferentes, três frases: "faltam
                              2" pede compra, "sem sobra" pede atenção e
                              "última unidade" só avisa. Uma frase só para os
                              três casos apagaria a diferença que decide o
                              que fazer. */}
                          {item.disponivel < 0 ? (
                            <span className="text-red-700">
                              Faltam {Math.abs(item.disponivel)}
                            </span>
                          ) : item.disponivel === 0 ? (
                            <span className="text-amber-700">Sem sobra</span>
                          ) : (
                            <span className="text-amber-700">Última unidade</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <p className="mt-4 text-sm font-medium text-navy">Reservas desta data</p>
                <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                  {dia.reservas.map((r) => (
                    <li key={r.id}>
                      {r.cliente}
                      {r.telefone ? ` · ${r.telefone}` : ""} · {ETAPA[r.status] ?? r.status}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sem esta linha, um produto sem estoque preenchido parece "sem
          problema" quando na verdade é "sem informação" — e a Maria Luiza
          confiaria numa tela que não sabe o que está dizendo. */}
      <p className="mt-6 text-xs text-muted-foreground">
        Só entram aqui os produtos com estoque preenchido no cadastro. Produto sem estoque não é
        conferido nem barra reserva.
      </p>
    </div>
  );
}
