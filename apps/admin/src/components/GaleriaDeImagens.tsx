import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/api";

/**
 * As imagens de um lugar, na ordem em que aparecem.
 *
 * Sem drag-and-drop de propósito: mover com seta funciona no celular, no
 * teclado e no leitor de tela, e não traz uma biblioteca inteira para
 * resolver o que duas setas resolvem. A primeira imagem é a capa — a ordem
 * já diz isso, e um campo "qual é a capa" seria um segundo lugar para a
 * mesma informação divergir.
 */

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api/v1";
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export async function enviarImagem(arquivo: File, pasta: string): Promise<string> {
  const corpo = new FormData();
  corpo.append("file", arquivo);
  const resposta = await fetch(`${API}/uploads/image/${pasta}`, {
    method: "POST",
    headers: { authorization: `Bearer ${getToken()}` },
    body: corpo,
  });
  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => ({}));
    throw new Error(erro.message ?? "Não foi possível enviar a imagem.");
  }
  return (await resposta.json()).url as string;
}

export function GaleriaDeImagens({
  imagens,
  aoMudar,
  pasta,
  rotuloDeCapa = "capa da proposta",
  vazio = "Nenhuma imagem ainda.",
}: {
  imagens: string[];
  aoMudar: (imagens: string[]) => void;
  /** Pasta do upload: propostas, institucional… */
  pasta: string;
  rotuloDeCapa?: string;
  vazio?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function selecionar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setEnviando(true);
    const novas: string[] = [];
    for (const arquivo of Array.from(arquivos)) {
      if (arquivo.size > TAMANHO_MAXIMO) {
        toast.error(`${arquivo.name} tem mais de 5 MB. Reduza a imagem e tente de novo.`);
        continue;
      }
      try {
        novas.push(await enviarImagem(arquivo, pasta));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao enviar a imagem.");
      }
    }
    setEnviando(false);
    if (entrada.current) entrada.current.value = "";
    if (novas.length > 0) {
      aoMudar([...imagens, ...novas]);
      toast.success(novas.length === 1 ? "Imagem enviada." : `${novas.length} imagens enviadas.`);
    }
  }

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= imagens.length) return;
    const copia = [...imagens];
    const [item] = copia.splice(de, 1);
    copia.splice(para, 0, item);
    aoMudar(copia);
  };

  return (
    <div className="space-y-3">
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => selecionar(e.target.files)}
      />

      {imagens.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {vazio}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {imagens.map((url, i) => (
            <li key={`${url}-${i}`} className="overflow-hidden rounded-md border">
              <div className="relative">
                <img src={url} alt="" className="h-28 w-full object-cover" />
                {i === 0 && (
                  <span
                    className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider"
                    style={{ background: "rgba(224,90,58,0.92)", color: "#fff" }}
                  >
                    <Star className="size-3" /> {rotuloDeCapa}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-1">
                <span className="flex">
                  <Button
                    type="button" variant="ghost" size="icon" className="h-9 w-9"
                    aria-label={`Mover imagem ${i + 1} para trás`}
                    disabled={i === 0} onClick={() => mover(i, i - 1)}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-9 w-9"
                    aria-label={`Mover imagem ${i + 1} para frente`}
                    disabled={i === imagens.length - 1} onClick={() => mover(i, i + 1)}
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                </span>
                <Button
                  type="button" variant="ghost" size="icon" className="h-9 w-9"
                  aria-label={`Remover imagem ${i + 1}`}
                  onClick={() => aoMudar(imagens.filter((_, k) => k !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button" variant="outline" className="min-h-11"
        onClick={() => entrada.current?.click()} disabled={enviando}
      >
        <Upload className="mr-1 size-4" />
        {enviando ? "Enviando…" : imagens.length === 0 ? "Enviar imagem" : "Enviar mais imagens"}
      </Button>
      <p className="text-xs text-muted-foreground">
        JPEG, PNG ou WebP, até 5 MB. A primeira imagem é a {rotuloDeCapa}; use as setas para mudar
        a ordem.
      </p>
    </div>
  );
}

/**
 * Uma imagem só — as seções institucionais têm uma cada.
 *
 * Reaproveita o mesmo upload: trocar a foto da Maria Luiza é enviar outra,
 * não editar um endereço que ninguém sabe de onde tirar.
 */
export function ImagemUnica({
  url,
  aoMudar,
  pasta,
  rotulo,
}: {
  url: string;
  aoMudar: (url: string) => void;
  pasta: string;
  rotulo: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function selecionar(arquivo?: File) {
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAXIMO) {
      toast.error("A imagem tem mais de 5 MB. Reduza e tente de novo.");
      return;
    }
    setEnviando(true);
    try {
      aoMudar(await enviarImagem(arquivo, pasta));
      toast.success("Imagem atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar a imagem.");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => selecionar(e.target.files?.[0])}
      />
      {url ? (
        <img src={url} alt="" className="h-28 w-28 rounded-md border object-cover" />
      ) : (
        <span className="flex h-28 w-28 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          sem imagem
        </span>
      )}
      <div className="flex flex-col gap-2">
        <Button
          type="button" variant="outline" className="min-h-11"
          onClick={() => entrada.current?.click()} disabled={enviando}
        >
          <Upload className="mr-1 size-4" />
          {enviando ? "Enviando…" : url ? "Substituir" : `Enviar ${rotulo}`}
        </Button>
        {url && (
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => aoMudar("")}>
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}
