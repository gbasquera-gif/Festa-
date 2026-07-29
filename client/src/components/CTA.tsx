import { MessageCircle } from "lucide-react";
import { BRAND } from "@/const";

export default function CTA() {
  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/manus-storage/galeria-2_cbae8925.webp"
          alt=""
          aria-hidden="true"
          width={1920}
          height={1920}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F2A4F]/95 via-[#0F2A4F]/85 to-[#0F2A4F]/60" />
      </div>

      {/* Content */}
      <div className="container relative z-10 fade-in-section">
        <div className="max-w-2xl">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 leading-tight" style={{ fontFamily: "Nunito" }}>
            Pronta para<br />
            <span className="text-[#F06853]">comemorar?</span>
          </h2>
          <p className="text-lg md:text-xl text-white/80 mb-8 max-w-xl">
            Fale com a nossa equipe agora mesmo e monte o kit perfeito para a sua festa.
            Atendimento rápido pelo WhatsApp.
          </p>
          <a
            href={`https://wa.me/${BRAND.phoneRaw}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 bg-[#F06853] hover:bg-[#E0402E] text-white font-bold px-8 py-4 rounded-full text-lg transition-all duration-200 active:scale-95 shadow-2xl"
          >
            <MessageCircle className="w-6 h-6" />
            {BRAND.phone}
          </a>
        </div>
      </div>
    </section>
  );
}
