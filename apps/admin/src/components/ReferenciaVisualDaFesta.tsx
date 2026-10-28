import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";

type ReferenciaVisual = { opcao: string | null; imagens: string[] };

/**
 * As fotos da decoração que a cliente viu na proposta que virou esta reserva
 * (só a opção aprovada). Carregadas quando o detalhe é aberto, não com a
 * lista. Reserva feita no aplicativo, proposta sem foto ou erro na consulta:
 * a seção simplesmente não aparece, e o resto do detalhe segue igual.
 */
export function ReferenciaVisualDaFesta({ reservaId }: { reservaId: string }) {
  const { data } = useQuery({
    queryKey: ["referencia-visual", reservaId],
    queryFn: () => api<ReferenciaVisual>(`/reservations/${reservaId}/referencia-visual`),
    staleTime: 5 * 60_000,
  });
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [quebradas, setQuebradas] = useState<ReadonlySet<string>>(new Set());

  const imagens = data?.imagens ?? [];
  if (imagens.length === 0) return null;
  const quebrou = (url: string) => setQuebradas((q) => new Set(q).add(url));
  const [capa, ...demais] = imagens;
  const miniaturas = demais.slice(0, 3);
  const escondidas = demais.length - miniaturas.length;

  return (
    <div className="space-y-2 border-t pt-3" data-referencia-visual>
      <h3 className="text-sm font-bold text-navy">Referência visual da festa</h3>
      <p className="text-xs text-muted-foreground">
        {data?.opcao ? `Opção aprovada: ${data.opcao}` : "Como foi apresentada na proposta"}
      </p>
      <Miniatura
        url={capa}
        rotulo={`Ampliar foto 1 de ${imagens.length}`}
        quebrada={quebradas.has(capa)}
        aoQuebrar={quebrou}
        aoAbrir={() => setAmpliada(0)}
        className="aspect-[4/3] w-full"
      />
      {miniaturas.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {miniaturas.map((url, i) => (
            <Miniatura
              key={url}
              url={url}
              rotulo={`Ampliar foto ${i + 2} de ${imagens.length}`}
              quebrada={quebradas.has(url)}
              aoQuebrar={quebrou}
              aoAbrir={() => setAmpliada(i + 1)}
              className="aspect-square w-full"
              mais={i === miniaturas.length - 1 && escondidas > 0 ? escondidas : 0}
            />
          ))}
        </div>
      )}
      {ampliada !== null && (
        <Ampliacao
          imagens={imagens}
          indice={ampliada}
          opcao={data?.opcao ?? null}
          quebradas={quebradas}
          aoQuebrar={quebrou}
          aoMudar={setAmpliada}
          aoFechar={() => setAmpliada(null)}
        />
      )}
    </div>
  );
}

function Miniatura({
  url,
  rotulo,
  quebrada,
  aoQuebrar,
  aoAbrir,
  className,
  mais = 0,
}: {
  url: string;
  rotulo: string;
  quebrada: boolean;
  aoQuebrar: (url: string) => void;
  aoAbrir: () => void;
  className: string;
  mais?: number;
}) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={rotulo}
      className={`relative overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 ${className}`}
    >
      {quebrada ? (
        <FotoIndisponivel />
      ) : (
        <img src={url} alt="" loading="lazy" onError={() => aoQuebrar(url)} className="size-full object-cover" />
      )}
      {mais > 0 && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
          +{mais}
        </span>
      )}
    </button>
  );
}

function FotoIndisponivel() {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-xs text-muted-foreground">
      <ImageOff className="size-5" aria-hidden />
      Foto indisponível
    </span>
  );
}

/**
 * A foto inteira, sem corte, do tamanho que a tela comporta. Fecha no X, no
 * Esc ou tocando fora; com mais de uma foto, troca pelas setas da tela, pelas
 * do teclado ou deslizando o dedo.
 */
function Ampliacao({
  imagens,
  indice,
  opcao,
  quebradas,
  aoQuebrar,
  aoMudar,
  aoFechar,
}: {
  imagens: string[];
  indice: number;
  opcao: string | null;
  quebradas: ReadonlySet<string>;
  aoQuebrar: (url: string) => void;
  aoMudar: (i: number) => void;
  aoFechar: () => void;
}) {
  const inicioDoToque = useRef<number | null>(null);
  const total = imagens.length;
  const varias = total > 1;
  const ir = (passo: number) => aoMudar((indice + passo + total) % total);
  const url = imagens[indice];

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        data-ampliacao
        className="max-w-[calc(100%-1rem)] gap-2 border-none bg-neutral-950 p-2 text-white sm:max-w-[min(92vw,1100px)] sm:p-3"
        onKeyDown={(e) => {
          if (!varias) return;
          if (e.key === "ArrowRight") ir(1);
          else if (e.key === "ArrowLeft") ir(-1);
        }}
        onTouchStart={(e) => {
          inicioDoToque.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const inicio = inicioDoToque.current;
          inicioDoToque.current = null;
          const fim = e.changedTouches[0]?.clientX;
          if (!varias || inicio === null || fim === undefined) return;
          if (Math.abs(fim - inicio) > 50) ir(fim < inicio ? 1 : -1);
        }}
      >
        <div className="flex items-center justify-between gap-2 pl-1">
          <DialogTitle className="text-sm font-medium text-white">
            {opcao ? `Opção aprovada: ${opcao}` : "Referência visual da festa"}
            {varias && <span className="ml-2 text-white/70">{`${indice + 1} de ${total}`}</span>}
          </DialogTitle>
          <DialogClose
            aria-label="Fechar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="size-5" aria-hidden />
          </DialogClose>
        </div>
        <div className="relative flex min-h-40 items-center justify-center">
          {quebradas.has(url) ? (
            <div className="h-60 w-full">
              <FotoIndisponivel />
            </div>
          ) : (
            <img
              key={url}
              src={url}
              alt={`Foto ${indice + 1} de ${total} da decoração`}
              onError={() => aoQuebrar(url)}
              draggable={false}
              className="h-auto max-h-[80dvh] w-auto max-w-full select-none object-contain"
            />
          )}
          {varias && (
            <>
              <button
                type="button"
                aria-label="Foto anterior"
                onClick={() => ir(-1)}
                className="absolute left-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="size-6" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Próxima foto"
                onClick={() => ir(1)}
                className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="size-6" aria-hidden />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
