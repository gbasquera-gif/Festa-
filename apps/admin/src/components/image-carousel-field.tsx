import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadImage } from "@/lib/api";

const MAX_IMAGES = 4;

interface ImageCarouselFieldProps {
  label: string;
  folder: "themes" | "kits" | "products";
  value: string[];
  onChange: (urls: string[]) => void;
}

export function ImageCarouselField({ label, folder, value, onChange }: ImageCarouselFieldProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(folder, file);
      onChange([...value, url]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label} ({value.length}/{MAX_IMAGES})
      </Label>
      <div className="flex flex-wrap gap-3">
        {value.map((url, index) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-md border">
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute right-1 top-1 rounded-full bg-navy/80 p-0.5 text-white"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {value.length < MAX_IMAGES && (
          <>
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
              className="size-20 flex-col gap-1"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              <span className="text-xs">Adicionar</span>
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Visão geral, detalhes da decoração, mesa principal, ambiente completo.
      </p>
    </div>
  );
}
