import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { GaleriaDeImagens, ImagemUnica } from "@/components/GaleriaDeImagens";

/**
 * O que a proposta conta sobre a Festaê.
 *
 * Nem CMS nem texto no código: são seis blocos com título, texto e foto,
 * guardados numa tabela chave-valor. Deixar no código obrigaria um deploy
 * para trocar a foto da Maria Luiza; construir um CMS seria uma ferramenta
 * inteira para administrar meia dúzia de parágrafos.
 *
 * Bloco vazio não aparece na proposta. É de propósito: melhor uma proposta
 * mais curta que um título anunciando um texto que ninguém escreveu.
 */

const BLOCOS = [
  {
    chave: "capa",
    padrao: "Capa da proposta",
    ajuda: "A imagem grande da primeira tela. Em branco, a proposta usa a arte padrão da marca.",
    temImagem: true,
  },
  {
    chave: "apresentacao",
    padrao: "Conheça a Festaê",
    ajuda: "A apresentação curta da empresa — o que a Festaê faz e para quem.",
    temImagem: true,
  },
  {
    chave: "historia",
    padrao: "Nossa história",
    ajuda: "Como a Festaê nasceu, em poucas linhas e com voz de gente.",
    temImagem: true,
  },
  {
    chave: "quem",
    padrao: "Quem está por trás",
    ajuda: "A apresentação da Maria Luiza. A foto aparece ao lado do texto na proposta.",
    temImagem: true,
  },
  {
    chave: "jeito",
    padrao: "Nosso jeito de fazer",
    ajuda: "Os diferenciais: personalização, montagem, balões, festa pronta. Curto.",
    temImagem: true,
  },
  {
    chave: "condicoes",
    padrao: "Condições padrão",
    ajuda: "Pagamento, retirada, devolução — o que vale para toda proposta.",
    temImagem: false,
  },
] as const;

/**
 * O que a cliente precisa para pagar o sinal.
 *
 * Fica aqui, e não no código, porque chave Pix muda e favorecido muda — e
 * cada troca exigiria um deploy. São campos de uma linha, não parágrafos,
 * então têm o seu próprio bloco em vez de virarem "texto".
 */
const PAGAMENTO = [
  {
    chave: "sinal_percentual",
    rotulo: "Percentual do sinal",
    ajuda: "Vale para toda proposta que não definir o seu. Em branco, o sistema usa 30%.",
    placeholder: "30",
  },
  {
    chave: "pix_chave",
    rotulo: "Chave Pix",
    ajuda: "O que a cliente copia na proposta. CNPJ, telefone, e-mail ou chave aleatória.",
    placeholder: "00.000.000/0001-00",
  },
  {
    chave: "pix_favorecido",
    rotulo: "Favorecido",
    ajuda: "O nome que aparece para a cliente conferir antes de pagar.",
    placeholder: "Festaê Decorações LTDA",
  },
  {
    chave: "pix_instrucao",
    rotulo: "Instrução de pagamento",
    ajuda: "O que fazer depois do Pix. Em branco, a proposta usa uma instrução padrão.",
    placeholder: "Envie o comprovante no WhatsApp para confirmarmos sua data.",
  },
] as const;

type Bloco = { titulo: string; texto: string; imagemUrl: string };

export default function ConteudoInstitucional() {
  const queryClient = useQueryClient();
  const { data } = useQuery<Record<string, { titulo: string | null; texto: string | null; imagemUrl: string | null }>>({
    queryKey: ["orcamentos", "conteudo"],
    queryFn: () => api("/orcamentos/conteudo"),
  });

  const [valores, setValores] = useState<Record<string, Bloco>>({});
  /**
   * A galeria mora numa chave só, com um endereço por linha.
   *
   * Poderia ser uma tabela de imagens; seriam duas entidades e uma tela de
   * administração para guardar meia dúzia de fotos em ordem. A lista de
   * linhas resolve ordenação, inclusão e remoção com o que já existe.
   */
  const [galeria, setGaleria] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    const inicial: Record<string, Bloco> = {};
    for (const b of [...BLOCOS, ...PAGAMENTO] as { chave: string }[]) {
      inicial[b.chave] = {
        titulo: data[b.chave]?.titulo ?? "",
        texto: data[b.chave]?.texto ?? "",
        imagemUrl: data[b.chave]?.imagemUrl ?? "",
      };
    }
    setValores(inicial);
    setGaleria((data.galeria?.texto ?? "").split("\n").map((u) => u.trim()).filter(Boolean));
  }, [data]);

  const salvar = useMutation({
    mutationFn: () =>
      api("/orcamentos/conteudo", {
        method: "PUT",
        body: JSON.stringify({
          blocos: [
            ...[...BLOCOS, ...PAGAMENTO].map((b) => ({
              chave: b.chave,
              titulo: valores[b.chave]?.titulo,
              texto: valores[b.chave]?.texto,
              imagemUrl: valores[b.chave]?.imagemUrl,
            })),
            { chave: "galeria", texto: galeria.join("\n") },
          ],
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orcamentos", "conteudo"] });
      toast.success("Conteúdo salvo. Vale para as próximas propostas abertas.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const alterar = (chave: string, campo: keyof Bloco, valor: string) =>
    setValores((atual) => ({ ...atual, [chave]: { ...atual[chave], [campo]: valor } }));

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        O que toda proposta conta sobre a Festaê, antes de falar da festa da cliente. Bloco em
        branco não aparece na proposta.
      </p>

      {BLOCOS.map((b) => (
        <section key={b.chave} className="painel-cartao space-y-3 p-4">
          <div>
            <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
              {b.padrao}
            </h2>
            <p className="text-xs text-muted-foreground">{b.ajuda}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${b.chave}-titulo`}>Título na proposta</Label>
            <Input
              id={`${b.chave}-titulo`}
              value={valores[b.chave]?.titulo ?? ""}
              onChange={(e) => alterar(b.chave, "titulo", e.target.value)}
              placeholder={b.padrao}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${b.chave}-texto`}>Texto</Label>
            <textarea
              id={`${b.chave}-texto`}
              value={valores[b.chave]?.texto ?? ""}
              onChange={(e) => alterar(b.chave, "texto", e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-background p-3 text-sm"
              placeholder="Escreva com as palavras da Festaê."
            />
          </div>

          {b.temImagem && (
            <div className="space-y-1.5">
              <Label>Imagem</Label>
              <ImagemUnica
                url={valores[b.chave]?.imagemUrl ?? ""}
                aoMudar={(url) => alterar(b.chave, "imagemUrl", url)}
                pasta="institucional"
                rotulo="imagem"
              />
            </div>
          )}
        </section>
      ))}

      <section className="painel-cartao space-y-3 p-4">
        <div>
          <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
            Galeria da Festaê
          </h2>
          <p className="text-xs text-muted-foreground">
            Fotos de festas já feitas, mostradas em toda proposta depois de “Nosso jeito de fazer”.
            A ordem aqui é a ordem lá.
          </p>
        </div>
        <GaleriaDeImagens
          imagens={galeria}
          aoMudar={setGaleria}
          pasta="institucional"
          rotuloDeCapa="primeira"
          vazio="Nenhuma foto na galeria. Sem fotos, a seção não aparece na proposta."
        />
      </section>

      <section className="painel-cartao space-y-4 p-4">
        <div>
          <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
            Pagamento do sinal
          </h2>
          <p className="text-xs text-muted-foreground">
            O que a proposta mostra depois que a cliente aprova. Aprovar não é pagar: o
            recebimento continua sendo confirmado por vocês, na reserva.
          </p>
        </div>
        {PAGAMENTO.map((c) => (
          <div key={c.chave} className="space-y-1.5">
            <Label htmlFor={c.chave}>{c.rotulo}</Label>
            <Input
              id={c.chave}
              value={valores[c.chave]?.texto ?? ""}
              onChange={(e) => alterar(c.chave, "texto", e.target.value)}
              placeholder={c.placeholder}
            />
            <p className="text-xs text-muted-foreground">{c.ajuda}</p>
          </div>
        ))}
      </section>

      <div className="flex justify-end pb-4">
        <Button className="min-h-11" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Salvar conteúdo"}
        </Button>
      </div>
    </div>
  );
}
