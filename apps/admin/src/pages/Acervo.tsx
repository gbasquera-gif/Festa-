import { useQuery } from "@tanstack/react-query";
import { ModuloComAbas, ResumoDoModulo } from "@/components/ModuloComAbas";
import Themes from "./Themes";
import Products from "./Products";
import Kits from "./Kits";
import { api } from "@/lib/api";

/**
 * Acervo reúne o que antes eram três itens de menu.
 *
 * Temas, Produtos e Kits são o mesmo assunto visto em três recortes, e cada
 * um ocupando uma linha da barra lateral dava a eles o mesmo peso de
 * Financeiro. Os CRUDs não mudaram: são os mesmos componentes, agora dentro
 * de abas.
 */
export default function Acervo() {
  const temas = useQuery<{ id: string }[]>({ queryKey: ["themes"], queryFn: () => api("/themes") });
  const produtos = useQuery<{ id: string; stockQuantity?: number }[]>({
    queryKey: ["products"], queryFn: () => api("/products"),
  });
  const kits = useQuery<{ id: string }[]>({ queryKey: ["kits"], queryFn: () => api("/kits") });

  const emFalta = produtos.data?.filter((p) => (p.stockQuantity ?? 0) === 0).length ?? 0;

  return (
    <ModuloComAbas
      base="/acervo"
      titulo="Acervo"
      descricao="Os temas, os produtos e os kits que a Festaê aluga."
      abas={[
        {
          chave: "",
          rotulo: "Visão Geral",
          conteudo: (
            <ResumoDoModulo
              cartoes={[
                { rotulo: "Temas", valor: temas.data?.length ?? "—", href: "/acervo/temas" },
                { rotulo: "Produtos", valor: produtos.data?.length ?? "—", href: "/acervo/produtos" },
                { rotulo: "Kits", valor: kits.data?.length ?? "—", href: "/acervo/kits" },
                {
                  rotulo: "Produtos sem estoque",
                  valor: emFalta,
                  nota: emFalta > 0 ? "não podem ser reservados" : "nenhum",
                  href: "/acervo/produtos",
                },
              ]}
              aviso="Desempenho do acervo — itens mais usados, itens parados e investimento contra utilização — fica para a próxima etapa."
            />
          ),
        },
        { chave: "temas", rotulo: "Temas", conteudo: <Themes /> },
        { chave: "produtos", rotulo: "Produtos", conteudo: <Products /> },
        { chave: "kits", rotulo: "Kits", conteudo: <Kits /> },
      ]}
    />
  );
}
