import { ModuloComAbas } from "@/components/ModuloComAbas";
import { VisaoGeralComercial } from "@/components/comercial/VisaoGeralComercial";
import Funil from "./Funil";
import Orcamentos from "./Orcamentos";
import ConteudoInstitucional from "./ConteudoInstitucional";

/**
 * Comercial passa a abrigar o Funil.
 *
 * O Funil não foi reescrito — é o mesmo componente, agora numa aba. A Visão
 * Geral é o painel comercial: o que foi vendido, para quando e como, com o
 * mesmo contratado que o Financeiro chama de faturamento.
 */
export default function Comercial() {
  return (
    <ModuloComAbas
      base="/comercial"
      titulo="Comercial"
      descricao="Como a venda entra e como ela anda."
      abas={[
        { chave: "", rotulo: "Visão Geral", conteudo: <VisaoGeralComercial /> },
        { chave: "funil", rotulo: "Funil", conteudo: <Funil /> },
        { chave: "orcamentos", rotulo: "Orçamentos", conteudo: <Orcamentos /> },
        { chave: "conteudo", rotulo: "Conteúdo da proposta", conteudo: <ConteudoInstitucional /> },
      ]}
    />
  );
}
