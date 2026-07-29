import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { FAQ as FAQ_DATA } from "@/const";

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 md:py-28 bg-[#FDF9F4] relative overflow-hidden">
      <div className="container relative z-10 fade-in-section">
        <div className="grid lg:grid-cols-[1fr_1.5fr] gap-12">
          {/* Left column — header */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <span className="inline-block text-sm font-bold text-[#F06853] uppercase tracking-widest mb-3">
              Tire suas dúvidas
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-[#0F2A4F] mb-4" style={{ fontFamily: "Nunito" }}>
              Perguntas<br />frequentes
            </h2>
            <p className="text-lg text-[#6B7B8F] mb-6">
              Reunimos as perguntas mais comuns. Não encontrou o que procurava?
            </p>
            <a
              href="#contato"
              className="inline-flex items-center gap-2 text-[#F06853] font-bold hover:gap-3 transition-all"
            >
              Fale com a gente →
            </a>
          </div>

          {/* Right column — accordion */}
          <div className="space-y-3">
            {FAQ_DATA.map((item, index) => (
              <div
                key={index}
                className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${
                  openIndex === index ? "border-[#F06853] shadow-md" : "border-[#E5DCC8]"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left"
                >
                  <span className="font-bold text-[#0F2A4F] text-base md:text-lg">
                    {item.question}
                  </span>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    openIndex === index ? "bg-[#F06853] text-white" : "bg-[#F0E6D8] text-[#0F2A4F]"
                  }`}>
                    {openIndex === index ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-300 ${
                    openIndex === index ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-[#6B7B8F] leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
