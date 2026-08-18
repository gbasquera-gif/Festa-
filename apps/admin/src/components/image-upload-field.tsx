import { useRef, useState } from "react";
import { ImageOff, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadImage } from "@/lib/api";

/**
 * Tamanho recomendado, calculado a partir do maior espaço em que a imagem
 * aparece no app: o carrossel do detalhe, que ocupa a largura da tela por
 * 260 pontos de altura — cerca de 1170 × 780 pixels num celular 3x.
 *
 * A dica fica aqui, no momento do envio, porque o servidor não redimensiona:
 * a imagem é entregue ao aplicativo exatamente como foi enviada. Uma foto
 * direto da câmera tem uns 4 MB e seria baixada inteira para preencher um
 * card de 150 pixels — com oito kits na home, são dezenas de megabytes por
 * visita. Em dados móveis, é a diferença entre "abriu rápido" e "esse app
 * trava".
 */
const TAMANHO_RECOMENDADO = "Ideal: 1200 × 900 px (4:3), até 300 KB. Máximo aceito: 5 MB.";

/**
 * A capa é miniatura de lista, e lista só funciona com cards do mesmo
 * tamanho — então ela é recortada num retângulo deitado. Dizer isso aqui
 * evita a surpresa de enviar uma foto em pé bonita e ver no app só a faixa
 * do meio dela. A foto inteira tem lugar: o carrossel, logo abaixo.
 */
const AVISO_DE_CORTE =
  "Aparece recortada num retângulo deitado nas listas. Prefira foto deitada, com o " +
  "principal no centro. Para mostrar a decoração inteira, use o carrossel abaixo.";

interface ImageUploadFieldProps {
  label: string;
  folder: "themes" | "kits" | "products";
  // Aceita null porque é assim que a API devolve "sem imagem".
  value?: string | null;
  onChange: (url: string | undefined) => void;
}

export function ImageUploadField({ label, folder, value, onChange }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    // Avisa, mas não impede: a foto grande funciona, só deixa o app pesado.
    // Barrar seria pior — travaria o cadastro por um problema de desempenho.
    if (file.size > 800 * 1024) {
      toast.warning(
        `Imagem de ${Math.round(file.size / 1024)} KB. Ela vai funcionar, mas deixa o app ` +
          "lento no celular. O ideal é reduzir para 1200 × 900 px, até 300 KB.",
      );
    }

    setUploading(true);
    try {
      const { url } = await uploadImage(folder, file);
      onChange(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <p className="text-xs text-muted-foreground">{AVISO_DE_CORTE}</p>
      <p className="text-xs text-muted-foreground">{TAMANHO_RECOMENDADO}</p>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {value ? (
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <ImageOff className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {value ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
              <X className="size-4" /> Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
