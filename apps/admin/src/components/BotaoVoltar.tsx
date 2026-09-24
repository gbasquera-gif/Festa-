import { ArrowLeft } from "lucide-react";
import { useVoltar } from "@/lib/voltar";

/**
 * "← Voltar", no topo de toda tela interna do painel.
 *
 * Aparece sozinho: a casca do painel o põe acima do conteúdo quando a rota
 * é interna (a tabela fica em `@festae/shared/navegacao`). Nenhuma página
 * precisa lembrar de incluí-lo, e tela raiz nunca o recebe por engano.
 * 44px de altura para o dedo, mesmo sendo discreto.
 */
export function BotaoVoltar() {
  const { temVoltar, voltar } = useVoltar();
  if (!temVoltar) return null;
  return (
    <button type="button" onClick={voltar} className="painel-voltar">
      <ArrowLeft className="size-4" aria-hidden />
      Voltar
    </button>
  );
}
