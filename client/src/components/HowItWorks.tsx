import { Package, Wand2, PartyPopper } from "lucide-react";
import { STEPS } from "@/const";

const ICONS = {
  package: Package,
  wand: Wand2,
  party: PartyPopper,
};

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-20 md:py-28 bg-[#0F2A4F] relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-10 left-10 w-2 h-2 bg-[#C7A360] rounded-full opacity-50" />
      <div className="absolute top-32 right-20 w-3 h-3 bg-[#F06853] rounded-sm rotate-45 opacity-40" />
      <div className="absolute bottom-20 left-1/4 w-2 h-2 bg-[#C7A360] rounded-full opacity-30" />

      <div className="container relative z-10 fade-in-section">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-sm font-bold text-[#C7A360] uppercase tracking-widest mb-3">
            Simples assim
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4" style={{ fontFamily: "Nunito" }}>
            Como funciona
          </h2>
          <p className="text-lg text-white/70">
            Em três passos sua festa está pronta. Sem complicação, sem stress.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 md:gap-4">
          {STEPS.map((step, index) => {
            const Icon = ICONS[step.icon as keyof typeof ICONS];
            return (
              <div key={step.number} className="relative">
                {/* Connector line */}
                {index < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-full h-[2px] bg-gradient-to-r from-[#C7A360]/40 to-transparent" />
                )}

                <div className="relative flex flex-col items-center text-center px-4">
                  {/* Icon circle */}
                  <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 bg-[#F06853] rounded-full" />
                    <div className="absolute inset-[3px] bg-[#0F2A4F] rounded-full flex items-center justify-center">
                      <Icon className="w-10 h-10 text-[#F06853]" strokeWidth={1.5} />
                    </div>
                    {/* Number badge */}
                    <div className="absolute -top-1 -right-1 w-8 h-8 bg-[#C7A360] rounded-full flex items-center justify-center text-xs font-black text-[#0F2A4F]">
                      {step.number}
                    </div>
                  </div>

                  <h3 className="text-2xl font-black text-white mb-3" style={{ fontFamily: "Nunito" }}>
                    {step.title}
                  </h3>
                  <p className="text-white/70 leading-relaxed max-w-xs">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
