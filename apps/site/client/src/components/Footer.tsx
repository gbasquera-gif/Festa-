import { Instagram, MessageCircle, MapPin, Heart } from "lucide-react";
import { BRAND } from "@/const";

export default function Footer() {
  return (
    <footer className="bg-[#0A1F38] text-white pt-16 pb-8">
      <div className="container">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <h3 className="text-3xl font-black mb-3" style={{ fontFamily: "Nunito" }}>
              Festa<span className="text-[#F06853]">ê</span>!
            </h3>
            <p className="text-white/60 max-w-sm leading-relaxed mb-4">
              {BRAND.description}
            </p>
            <p className="text-[#C7A360] font-bold text-sm tracking-wider">
              {BRAND.slogan}
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-white/40 mb-4">
              Navegação
            </h4>
            <ul className="space-y-2">
              <li><a href="#servicos" className="text-white/70 hover:text-[#F06853] transition-colors text-sm">Serviços</a></li>
              <li><a href="#como-funciona" className="text-white/70 hover:text-[#F06853] transition-colors text-sm">Como Funciona</a></li>
              <li><a href="#galeria" className="text-white/70 hover:text-[#F06853] transition-colors text-sm">Galeria</a></li>
              <li><a href="#sobre" className="text-white/70 hover:text-[#F06853] transition-colors text-sm">Sobre</a></li>
              <li><a href="#faq" className="text-white/70 hover:text-[#F06853] transition-colors text-sm">FAQ</a></li>
              <li><a href="#contato" className="text-white/70 hover:text-[#F06853] transition-colors text-sm">Contato</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-white/40 mb-4">
              Contato
            </h4>
            <ul className="space-y-3">
              <li>
                <a href={`https://wa.me/${BRAND.phoneRaw}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/70 hover:text-[#F06853] transition-colors text-sm">
                  <MessageCircle className="w-4 h-4" />
                  {BRAND.phone}
                </a>
              </li>
              <li>
                <a href={BRAND.instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-white/70 hover:text-[#F06853] transition-colors text-sm">
                  <Instagram className="w-4 h-4" />
                  {BRAND.instagram}
                </a>
              </li>
              <li className="flex items-center gap-2 text-white/70 text-sm">
                <MapPin className="w-4 h-4" />
                {BRAND.city}-{BRAND.state} e região
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm text-center md:text-left">
            © {new Date().getFullYear()} Festaê! — Todos os direitos reservados.
          </p>
          <p className="text-white/40 text-sm flex items-center gap-1.5">
            Feito com <Heart className="w-3.5 h-3.5 text-[#F06853] fill-[#F06853]" /> em Chapecó-SC
          </p>
        </div>
      </div>
    </footer>
  );
}
