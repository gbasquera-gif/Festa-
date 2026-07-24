import { Heart, Sparkles, MapPin } from "lucide-react";
import { BRAND } from "@/const";

export default function About() {
  return (
    <section id="sobre" className="py-20 md:py-28 bg-white relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-20 right-0 w-80 h-80 bg-[#FDF9F4] rounded-full -translate-y-1/2 translate-x-1/2" />

      <div className="container relative z-10">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Image */}
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-full h-full border-2 border-[#C7A360] rounded-3xl" />
            <div className="relative rounded-3xl overflow-hidden">
              <img
                src="/manus-storage/maria-luiza-real_403ac9f6.jpg"
                alt={`${BRAND.owner} — proprietária da Festaê!`}
                className="w-full h-auto object-cover"
              />
            </div>
            {/* Badge */}
            <div className="absolute -bottom-5 -right-5 bg-[#F06853] text-white rounded-2xl px-6 py-4 shadow-xl">
              <p className="text-3xl font-black leading-none" style={{ fontFamily: "Nunito" }}>100%</p>
              <p className="text-xs font-semibold mt-1">dedicação à sua festa</p>
            </div>
          </div>

          {/* Content */}
          <div>
            <span className="inline-block text-sm font-bold text-[#F06853] uppercase tracking-widest mb-3">
              Quem está por trás
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-[#0F2A4F] mb-6" style={{ fontFamily: "Nunito" }}>
              Olá, eu sou a<br />Maria Luiza!
            </h2>
            <p className="text-lg text-[#6B7B8F] mb-6 leading-relaxed">
              Mãe, empreendedora e apaixonada por transformar momentos simples
              em memórias extraordinárias. Criei a <strong className="text-[#0F2A4F]">Festaê!</strong> para
              que outras mães possam celebrar sem precisar se preocupar com cada detalhe.
            </p>
            <p className="text-lg text-[#6B7B8F] mb-8 leading-relaxed">
              Cada kit é montado com carinho, pensando na praticidade que você precisa
              e na beleza que a sua festa merece. <strong className="text-[#0F2A4F]">Pegue, monte, comemore</strong> —
              o resto é comigo!
            </p>

            {/* Values */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F06853]/10 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-5 h-5 text-[#F06853]" />
                </div>
                <div>
                  <p className="font-bold text-[#0F2A4F] text-sm">Feito com carinho</p>
                  <p className="text-xs text-[#6B7B8F] mt-0.5">Cada detalhe pensado para você</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#C7A360]/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-[#C7A360]" />
                </div>
                <div>
                  <p className="font-bold text-[#0F2A4F] text-sm">Tudo completo</p>
                  <p className="text-xs text-[#6B7B8F] mt-0.5">Kits prontos, sem surpresas</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0F2A4F]/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-[#0F2A4F]" />
                </div>
                <div>
                  <p className="font-bold text-[#0F2A4F] text-sm">Chapecó-SC</p>
                  <p className="text-xs text-[#6B7B8F] mt-0.5">Atendimento na região</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
