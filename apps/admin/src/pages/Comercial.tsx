import { useQuery } from "@tanstack/react-query";
import { ModuloComAbas, ResumoDoModulo } from "@/components/ModuloComAbas";
import Funil from "./Funil";
import Orcamentos from "./Orcamentos";
import ConteudoInstitucional from "./ConteudoInstitucional";
import { api } from "@/lib/api";
import { brl } from "@/components/financeiro/formato";
import type { Panorama } from "@/components/financeiro/panorama";

/**
 * Comercial passa a abrigar o Funil.
 *
 * O Funil não foi reescrito — é o mesmo componente, agora numa aba. A
 * estrutura comporta Orçamentos e Inteligência quando existirem; enquanto não
 * existem, não há aba vazia prometendo o que não entrega.
 */
export default function Comercial() {
  const mes = new Date().toISOString().slice(0, 7);
  const panorama = useQuery<Panorama>({
    queryKey: ["financeiro", "panorama", Number(mes.slice(0, 4)), mes],
    queryFn: () => api(`/financeiro/panorama?ano=${mes.slice(0, 4)}&mes=${mes}`),
    // O resumo comercial é conveniência: se o financeiro recusar (OPS não vê
    // margem), a aba do Funil continua funcionando.
    retry: false,
  });
  const reservas = useQuery<{ id: string; status: string }[]>({
    queryKey: ["reservations"], queryFn: () => api("/reservations"),
  });

  const vigentes = reservas.data?.filter(
    (r) => !["CANCELLED", "REJECTED"].includes(r.status),
  ).length;

  return (
    <ModuloComAbas
      base="/comercial"
      titulo="Comercial"
      descricao="Como a venda entra e como ela anda."
      abas={[
        {
          chave: "",
          rotulo: "Visão Geral",
          conteudo: (
            <ResumoDoModulo
              cartoes={[
                { rotulo: "Contratos vigentes", valor: vigentes ?? "—", href: "/reservas" },
                {
                  rotulo: "Faturamento do mês",
                  valor: panorama.data ? brl(panorama.data.operacional.faturamento) : "—",
                  nota: "por competência",
                  href: "/financeiro",
                },
                {
                  rotulo: "A receber",
                  valor: panorama.data ? brl(panorama.data.aReceber) : "—",
                  nota: "saldo aberto",
                  href: "/financeiro",
                },
                { rotulo: "Jornada na loja", valor: "Funil", href: "/comercial/funil" },
                { rotulo: "Propostas", valor: "Orçamentos", href: "/comercial/orcamentos" },
              ]}
              aviso="Origem dos contratos, tipos de festa e ticket por canal ficam para a Inteligência, que ainda não existe — por isso não há aba vazia para ela."
            />
          ),
        },
        { chave: "funil", rotulo: "Funil", conteudo: <Funil /> },
        { chave: "orcamentos", rotulo: "Orçamentos", conteudo: <Orcamentos /> },
        { chave: "conteudo", rotulo: "Conteúdo da proposta", conteudo: <ConteudoInstitucional /> },
      ]}
    />
  );
}
