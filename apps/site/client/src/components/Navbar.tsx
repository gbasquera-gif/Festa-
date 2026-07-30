import { useState, useEffect } from "react";
import { Menu, X, Instagram, MessageCircle } from "lucide-react";
import { BRAND } from "@/const";

const NAV_LINKS = [
  { href: "#inicio", label: "Início" },
  { href: "#servicos", label: "Serviços" },
  { href: "#como-funciona", label: "Como Funciona" },
  { href: "#galeria", label: "Galeria" },
  { href: "#sobre", label: "Sobre" },
  { href: "#faq", label: "FAQ" },
  { href: "#contato", label: "Contato" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#0F2A4F] shadow-lg py-2"
            : "bg-transparent py-4"
        }`}
      >
        <nav className="container flex items-center justify-between">
          {/* Logo */}
          <a href="#inicio" className="flex items-center gap-2 group">
            <div className="flex items-center gap-1">
              <span className="text-2xl font-black text-white tracking-tight" style={{ fontFamily: "Nunito" }}>
                Festa<span className="text-[#F06853]">ê</span>!
              </span>
            </div>
          </a>

          {/* Desktop nav */}
          <ul className="hidden lg:flex items-center gap-7">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm font-semibold text-white/90 hover:text-[#F06853] transition-colors duration-200"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            <a
              href={BRAND.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#F06853] flex items-center justify-center transition-all duration-200"
              aria-label="Instagram"
            >
              <Instagram className="w-4 h-4 text-white" />
            </a>
            <a
              href={`https://wa.me/${BRAND.phoneRaw}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#F06853] hover:bg-[#E0402E] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all duration-200 flex items-center gap-2 active:scale-95"
            >
              <MessageCircle className="w-4 h-4" />
              Orçamento
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="lg:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </nav>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[#0F2A4F] pt-20 px-6 pb-8 overflow-y-auto">
            <ul className="flex flex-col gap-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block text-lg font-bold text-white py-3 border-b border-white/10 hover:text-[#F06853] transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3">
              <a
                href={`https://wa.me/${BRAND.phoneRaw}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#F06853] text-white text-center font-bold px-5 py-3 rounded-full transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                Pedir Orçamento
              </a>
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-white/20 text-white text-center font-bold px-5 py-3 rounded-full transition-all flex items-center justify-center gap-2"
              >
                <Instagram className="w-5 h-5" />
                {BRAND.instagram}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
