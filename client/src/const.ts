// Festaê! — Dados centralizados da marca

export const BRAND = {
  name: "Festaê!",
  slogan: "Pegue • Monte • Comemore",
  description: "Locação de artigos para festas infantis, chá de bebê e chá de revelação em Chapecó-SC e região.",
  owner: "Maria Luiza Pocai",
  phone: "(49) 99948-7777",
  phoneRaw: "5549999487777",
  instagram: "@festae.chapeco",
  instagramUrl: "https://www.instagram.com/festae.chapeco/",
  city: "Chapecó",
  state: "SC",
  region: "Chapecó e região",
  email: "contato@festae.com.br",
} as const;

export const COLORS = {
  navy: "#0F2A4F",
  coral: "#F06853",
  gold: "#C7A360",
  cream: "#FDF9F4",
  white: "#FFFFFF",
} as const;

export const SERVICES = [
  {
    id: "festas-infantis",
    title: "Festas Infantis",
    description: "Tudo para a festinha dos pequenos: mesas postas completas, decoração temática, balões e muito mais. É só escolher o tema e a gente cuida do resto.",
    image: "/manus-storage/hero-festa-infantil_0440e44f.webp",
    features: ["Mesas postas completas", "Decoração temática", "Balões e arcos", "Kit festa pronta"],
  },
  {
    id: "cha-de-bebe",
    title: "Chá de Bebê",
    description: "Receba o novo membro da família com estilo. Locação de conjuntos completos para um chá de bebê inesquecível e cheio de carinho.",
    image: "/manus-storage/hero-cha-bebe_1762568f.webp",
    features: ["Decoração navy e dourada", "Mesas de doces e salgados", "Favors personalizados", "Balões decorativos"],
  },
  {
    id: "cha-de-revelacao",
    title: "Chá de Revelação",
    description: "O momento mais aguardado merece uma celebração especial. Locação de artigos para revelar o sexo do bebê com estilo e emoção.",
    image: "/manus-storage/hero-cha-revelacao_fb4fda7f.webp",
    features: ["Kit revelação azul/rosa", "Decoração dual color", "Caixa surpresa", "Balões e confetes"],
  },
] as const;

export const STEPS = [
  {
    number: "01",
    title: "Pegue",
    description: "Escolha o kit completo para o seu tipo de festa. Tudo já vem separado e organizado para você.",
    icon: "package",
  },
  {
    number: "02",
    title: "Monte",
    description: "Siga o guia visual que acompanha cada kit. Em minutos sua festa está linda e pronta para receber os convidados.",
    icon: "wand",
  },
  {
    number: "03",
    title: "Comemore",
    description: "Aproveite cada momento com sua família e amigos. Depois é só devolver — nós cuidamos da limpeza.",
    icon: "party",
  },
] as const;

export const FAQ = [
  {
    question: "Como funciona a locação?",
    answer: "Você escolhe o kit desejado, entra em contato pelo WhatsApp para verificar disponibilidade, retira o kit completo no dia combinado e devolve após a festa. Simples assim!",
  },
  {
    question: "Quais regiões vocês atendem?",
    answer: "Atendemos Chapecó e região oeste de Santa Catarina. Para cidades vizinhas, consulte disponibilidade e taxas de entrega.",
  },
  {
    question: "Os itens vem limpos e higienizados?",
    answer: "Sim! Todos os artigos passam por um processo rigoroso de limpeza e higienização antes de cada locação. Sua família merece o melhor cuidado.",
  },
  {
    question: "Preciso pagar caução?",
    answer: "Sim, solicitamos um caução que é devolvido integralmente após a devolução dos itens em perfeito estado. É uma garantia para ambas as partes.",
  },
  {
    question: "Posso personalizar o kit?",
    answer: "Com certeza! Trabalhamos com diferentes temas e cores. Fale com a Maria Luiza pelo WhatsApp para montar o kit perfeito para a sua festa.",
  },
  {
    question: "Com quanto tempo de antecedência devo reservar?",
    answer: "Recomendamos reservar com pelo menos 15 dias de antecedência para garantir a disponibilidade dos itens. Mas sempre vale a pena consultar — podemos ter disponibilidade de última hora!",
  },
] as const;

export const GALLERY = [
  { src: "/manus-storage/galeria-1_8d8f179e.webp", alt: "Mesa posta elegante com pratos navy e detalhes dourados" },
  { src: "/manus-storage/galeria-2_cbae8925.webp", alt: "Arco de balões nas cores navy, coral e dourado" },
  { src: "/manus-storage/galeria-3_6c8c3715.webp", alt: "Mesa de doces decorada com 'Happy Birthday' em dourado" },
  { src: "/manus-storage/galeria-4_a855ed53.webp", alt: "Mesa de favors para chá de bebê com caixinhas brancas e douradas" },
  { src: "/manus-storage/hero-festa-infantil_0440e44f.webp", alt: "Mesa completa de festa infantil com balões e doces" },
  { src: "/manus-storage/hero-cha-bebe_1762568f.webp", alt: "Decoração de chá de bebê com tons navy e dourado" },
] as const;
