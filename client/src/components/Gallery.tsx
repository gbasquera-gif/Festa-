import { GALLERY } from "@/const";

export default function Gallery() {
  return (
    <section id="galeria" className="py-20 md:py-28 bg-[#FDF9F4] relative overflow-hidden">
      <div className="container relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-sm font-bold text-[#F06853] uppercase tracking-widest mb-3">
            Inspiração
          </span>
          <h2 className="text-4xl md:text-5xl font-black text-[#0F2A4F] mb-4" style={{ fontFamily: "Nunito" }}>
            Galeria de festas
          </h2>
          <p className="text-lg text-[#6B7B8F]">
            Algumas das celebrações que ajudamos a tornar inesquecíveis.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {GALLERY.map((item, index) => (
            <div
              key={index}
              className={`group relative overflow-hidden rounded-2xl ${
                index === 0 ? "col-span-2 row-span-2 md:col-span-1 md:row-span-1" : ""
              } ${index === 4 ? "md:col-span-2" : ""}`}
            >
              <div className={`relative ${index === 0 ? "aspect-square" : index === 4 ? "aspect-[2.2/1]" : "aspect-square"}`}>
                <img
                  src={item.src}
                  alt={item.alt}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F2A4F]/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <p className="absolute bottom-4 left-4 right-4 text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">
                  {item.alt}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Instagram CTA */}
        <div className="text-center mt-12">
          <p className="text-[#6B7B8F] mb-4">
            Veja mais festas no nosso Instagram
          </p>
          <a
            href="https://www.instagram.com/festae.chapeco/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#0F2A4F] hover:bg-[#1A3A5F] text-white font-bold px-6 py-3 rounded-full transition-all active:scale-95"
          >
            @festae.chapeco
          </a>
        </div>
      </div>
    </section>
  );
}
