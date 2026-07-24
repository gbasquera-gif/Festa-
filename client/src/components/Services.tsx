import { Check, ArrowRight } from "lucide-react";
import { SERVICES, BRAND } from "@/const";

export default function Services() {
  return (
    <section id="servicos" className="py-20 md:py-28 bg-[#FDF9F4] relative overflow-hidden">
      {/* Decorative arc */}
      <div className="absolute -top-32 -right-32 w-96 h-96 border-[3px] border-[#C7A360]/20 rounded-full" />
      <div className="absolute -bottom-20 -left-20 w-72 h-72 border-[2px] border-[#F06853]/10 rounded-full" />

      <div className="container relative z-10">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-sm font-bold text-[#F06853] uppercase tracking-widest mb-3">
            O que fazemos
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-[#0F2A4F] mb-4" style={{ fontFamily: "Nunito" }}>
            Tudo para a sua<br />celebração especial
          </h2>
          <p className="text-lg text-[#6B7B8F]">
            Kits completos de locação para cada momento. Escolha o seu e deixe o resto com a gente.
          </p>
        </div>

        {/* Service cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {SERVICES.map((service) => (
            <article
              key={service.id}
              className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-300 border border-[#E5DCC8]"
            >
              {/* Image */}
              <div className="relative h-56 overflow-hidden">
                <img
                  src={service.image}
                  alt={service.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F2A4F]/60 to-transparent" />
                <h3 className="absolute bottom-4 left-6 text-2xl font-black text-white" style={{ fontFamily: "Nunito" }}>
                  {service.title}
                </h3>
              </div>

              {/* Content */}
              <div className="p-6">
                <p className="text-[#6B7B8F] mb-5 leading-relaxed">
                  {service.description}
                </p>
                <ul className="space-y-2.5 mb-6">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm text-[#0F2A4F] font-semibold">
                      <span className="w-5 h-5 rounded-full bg-[#F06853]/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-[#F06853]" />
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <a
                  href={`https://wa.me/${BRAND.phoneRaw}?text=Olá! Tenho interesse no kit de ${service.title}.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-[#F06853] hover:gap-3 transition-all"
                >
                  Quero este kit
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
