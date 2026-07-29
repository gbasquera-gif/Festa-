import { MessageCircle, Sparkles, Star } from "lucide-react";
import { BRAND } from "@/const";

export default function Hero() {
  return (
    <section id="inicio" className="relative min-h-screen flex items-center overflow-hidden bg-[#0F2A4F]">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/manus-storage/hero-festa-infantil_0440e44f.webp"
          alt=""
          aria-hidden="true"
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F2A4F] via-[#0F2A4F]/80 to-[#0F2A4F]/30" />
      </div>

      {/* Decorative confetti */}
      <div className="absolute top-20 right-10 w-3 h-3 bg-[#F06853] rounded-sm rotate-45 confetti-float opacity-80" />
      <div className="absolute top-40 right-32 w-2 h-2 bg-[#C7A360] rounded-full confetti-float opacity-70" style={{ animationDelay: "1s" }} />
      <div className="absolute bottom-32 right-20 w-4 h-4 bg-[#F06853] rounded-sm rotate-12 confetti-float opacity-60" style={{ animationDelay: "2s" }} />
      <div className="absolute top-60 left-10 w-2 h-2 bg-[#C7A360] rounded-full confetti-float opacity-50" style={{ animationDelay: "0.5s" }} />

      {/* Content */}
      <div className="container relative z-10 pt-20">
        <div className="max-w-2xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-[#C7A360]/30 rounded-full px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-[#C7A360]" />
            <span className="text-sm font-semibold text-white/90">Chapecó-SC e região</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.05] mb-6" style={{ fontFamily: "Nunito" }}>
            Sua festa dos<br />
            <span className="text-[#F06853]">sonhos</span>, pronta<br />
            em minutos.
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-white/80 mb-8 max-w-xl leading-relaxed">
            Locação de artigos para festas infantis, chá de bebê e chá de revelação.
            Tudo completo, organizado e lindo — é só pegar, montar e comemorar.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={`https://wa.me/${BRAND.phoneRaw}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#F06853] hover:bg-[#E0402E] text-white font-bold px-8 py-4 rounded-full text-lg transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 shadow-xl"
            >
              <MessageCircle className="w-5 h-5" />
              Quero minha festa!
            </a>
            <a
              href="#servicos"
              className="border-2 border-white/30 hover:border-[#C7A360] text-white font-bold px-8 py-4 rounded-full text-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              Ver serviços
            </a>
          </div>

          {/* Trust indicators */}
          <div className="flex items-center gap-6 mt-12">
            <div className="flex items-center gap-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-[#C7A360] text-[#C7A360]" />
                ))}
              </div>
              <span className="text-sm text-white/70 font-semibold">Festas inesquecíveis</span>
            </div>
            <div className="h-5 w-px bg-white/20" />
            <div className="text-sm text-white/70 font-semibold">
              Pegue • Monte • Comemore
            </div>
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" fill="none" preserveAspectRatio="none" className="w-full h-[60px] md:h-[100px]">
          <path d="M0 120L60 110C120 100 240 80 360 75C480 70 600 80 720 85C840 90 960 90 1080 85C1200 80 1320 70 1380 65L1440 60V120H0Z" fill="#FDF9F4" />
        </svg>
      </div>
    </section>
  );
}
