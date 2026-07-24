import { MessageCircle } from "lucide-react";
import { BRAND } from "@/const";

export default function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${BRAND.phoneRaw}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] hover:bg-[#1DA851] rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle className="w-7 h-7 text-white" fill="white" />
      <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-20" />
    </a>
  );
}
