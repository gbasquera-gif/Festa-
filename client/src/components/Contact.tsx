import { MessageCircle, Instagram, MapPin, Clock, Mail } from "lucide-react";
import { BRAND } from "@/const";

export default function Contact() {
  return (
    <section id="contato" className="py-20 md:py-28 bg-[#0F2A4F] relative overflow-hidden">
      {/* Decorative */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#C7A360] to-transparent" />

      <div className="container relative z-10 fade-in-section">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-start">
          {/* Left — info */}
          <div>
            <span className="inline-block text-sm font-bold text-[#C7A360] uppercase tracking-widest mb-3">
              Vamos conversar
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6" style={{ fontFamily: "Nunito" }}>
              Entre em contato
            </h2>
            <p className="text-lg text-white/70 mb-10 leading-relaxed">
              Estamos prontas para ajudar você a criar a festa perfeita.
              Escolha o canal que preferir — respondemos rápido!
            </p>

            {/* Contact methods */}
            <div className="space-y-5">
              {/* WhatsApp */}
              <a
                href={`https://wa.me/${BRAND.phoneRaw}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-[#F06853] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-white/60 font-semibold">WhatsApp</p>
                  <p className="text-lg text-white font-bold">{BRAND.phone}</p>
                </div>
              </a>

              {/* Instagram */}
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F06853] to-[#C7A360] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Instagram className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-white/60 font-semibold">Instagram</p>
                  <p className="text-lg text-white font-bold">{BRAND.instagram}</p>
                </div>
              </a>

              {/* Location */}
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="w-12 h-12 rounded-full bg-[#C7A360] flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-6 h-6 text-[#0F2A4F]" />
                </div>
                <div>
                  <p className="text-sm text-white/60 font-semibold">Atendimento</p>
                  <p className="text-lg text-white font-bold">{BRAND.region}</p>
                </div>
              </div>

              {/* Hours */}
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-white/60 font-semibold">Horário</p>
                  <p className="text-lg text-white font-bold">Seg a Sáb, 8h às 19h</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right — quick message card */}
          <div className="bg-[#FDF9F4] rounded-3xl p-8 md:p-10 shadow-2xl">
            <h3 className="text-2xl font-black text-[#0F2A4F] mb-2" style={{ fontFamily: "Nunito" }}>
              Peça seu orçamento
            </h3>
            <p className="text-[#6B7B8F] mb-6">
              Preencha os dados e entraremos em contato pelo WhatsApp.
            </p>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData(form);
                const name = formData.get("name");
                const eventType = formData.get("eventType");
                const date = formData.get("date");
                const message = formData.get("message");
                const text = `Olá! Meu nome é ${name}. Gostaria de um orçamento para ${eventType}${date ? ` na data ${date}` : ""}.${message ? ` ${message}` : ""}`;
                window.open(`https://wa.me/${BRAND.phoneRaw}?text=${encodeURIComponent(text)}`, "_blank");
              }}
            >
              <div>
                <label className="block text-sm font-bold text-[#0F2A4F] mb-1.5">
                  Nome
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Seu nome"
                  className="w-full px-4 py-3 rounded-xl border border-[#E5DCC8] bg-white text-[#0F2A4F] placeholder:text-[#6B7B8F]/50 focus:outline-none focus:border-[#F06853] focus:ring-2 focus:ring-[#F06853]/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#0F2A4F] mb-1.5">
                  Tipo de festa
                </label>
                <select
                  name="eventType"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-[#E5DCC8] bg-white text-[#0F2A4F] focus:outline-none focus:border-[#F06853] focus:ring-2 focus:ring-[#F06853]/20 transition-all"
                >
                  <option value="">Selecione...</option>
                  <option value="Festa Infantil">Festa Infantil</option>
                  <option value="Chá de Bebê">Chá de Bebê</option>
                  <option value="Chá de Revelação">Chá de Revelação</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#0F2A4F] mb-1.5">
                  Data prevista (opcional)
                </label>
                <input
                  type="date"
                  name="date"
                  className="w-full px-4 py-3 rounded-xl border border-[#E5DCC8] bg-white text-[#0F2A4F] focus:outline-none focus:border-[#F06853] focus:ring-2 focus:ring-[#F06853]/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#0F2A4F] mb-1.5">
                  Mensagem (opcional)
                </label>
                <textarea
                  name="message"
                  rows={3}
                  placeholder="Conte-nos sobre a sua festa..."
                  className="w-full px-4 py-3 rounded-xl border border-[#E5DCC8] bg-white text-[#0F2A4F] placeholder:text-[#6B7B8F]/50 focus:outline-none focus:border-[#F06853] focus:ring-2 focus:ring-[#F06853]/20 transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#F06853] hover:bg-[#E0402E] text-white font-bold py-4 rounded-xl text-lg transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Enviar pelo WhatsApp
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
