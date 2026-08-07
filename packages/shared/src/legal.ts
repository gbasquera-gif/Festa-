/**
 * Política de Privacidade e Termos de Uso da Festaê.
 *
 * ATENÇÃO: este texto foi escrito a partir do que o código realmente faz —
 * quais dados são coletados, para quê e por quanto tempo. Ele é factualmente
 * correto e serve de base, mas **precisa de revisão de um advogado antes de
 * ser publicado nas lojas**. Os campos marcados como PENDENTE dependem de
 * dados cadastrais da empresa que não estão no repositório.
 *
 * Fonte única: o aplicativo e a página pública renderizam este mesmo
 * conteúdo. Alterar o texto exige subir TERMS_VERSION — é ela que fica
 * gravada no aceite de cada usuário.
 */

/** Sobe a cada alteração de conteúdo. Gravada no aceite do usuário. */
export const TERMS_VERSION = "1.0.0";

/** Data da última alteração do texto. Guardada em ISO para ordenar/comparar. */
export const TERMS_UPDATED_AT = "2026-08-07";

/** ISO vira dd/mm/aaaa — é assim que a data é lida no Brasil. */
export function formatLegalDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return day && month && year ? `${day}/${month}/${year}` : isoDate;
}

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export interface LegalDocument {
  slug: "privacidade" | "termos";
  title: string;
  version: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
}

// Dados cadastrais da empresa. PENDENTE: preencher com o cartão CNPJ antes
// de publicar — as lojas conferem se o responsável declarado bate com o
// titular da conta de desenvolvedor.
export const COMPANY = {
  legalName: "PENDENTE — razão social conforme cartão CNPJ",
  tradeName: "Festaê",
  taxId: "PENDENTE — CNPJ",
  address: "PENDENTE — endereço completo",
  city: "Chapecó",
  state: "SC",
  supportEmail: "contato@festaechapeco.com.br",
  privacyEmail: "contato@festaechapeco.com.br",
} as const;

export const PRIVACY_POLICY: LegalDocument = {
  slug: "privacidade",
  title: "Política de Privacidade",
  version: TERMS_VERSION,
  updatedAt: TERMS_UPDATED_AT,
  intro:
    `Esta política explica quais dados a ${COMPANY.tradeName} coleta no aplicativo, ` +
    "por que coleta, com quem compartilha e o que você pode exigir a respeito deles. " +
    "Ela segue a Lei Geral de Proteção de Dados (Lei 13.709/2018).",
  sections: [
    {
      title: "Quem é o controlador dos seus dados",
      paragraphs: [
        `${COMPANY.legalName}, inscrita no CNPJ ${COMPANY.taxId}, com sede em ${COMPANY.address}, ${COMPANY.city}/${COMPANY.state}.`,
        `Para qualquer assunto relacionado a dados pessoais, incluindo o exercício dos seus direitos, escreva para ${COMPANY.privacyEmail}.`,
      ],
    },
    {
      title: "Quais dados coletamos",
      paragraphs: [
        "Ao criar sua conta: nome, e-mail e, se você quiser informar, telefone. A senha é guardada apenas como um código embaralhado (hash) — nem nós conseguimos lê-la.",
        "Ao montar uma festa: data do evento, quantidade de convidados, orçamento desejado, tema escolhido e, quando você opta por entrega, o endereço e o bairro.",
        "Ao usar o aplicativo: registramos ações do seu percurso — cadastro, login, escolha de tema, escolha de kit, item adicionado, clique no WhatsApp, reserva criada, pagamento e desistência — para entender onde as pessoas travam e melhorar o serviço.",
        "Seu orçamento em construção fica guardado apenas no seu aparelho até virar um pedido.",
        "Não coletamos CPF, data de nascimento nem localização por GPS. O aplicativo não pede acesso à sua localização, câmera, contatos ou fotos.",
      ],
    },
    {
      title: "Por que usamos cada dado",
      paragraphs: [
        "Nome, e-mail e senha: identificar você e proteger o acesso à sua conta. Base legal: execução do contrato.",
        "Telefone, endereço, data do evento e número de convidados: preparar o orçamento, reservar a data e realizar a entrega e a retirada dos itens. Base legal: execução do contrato.",
        "Ações de uso: melhorar o aplicativo e entender o que atrapalha a experiência. Base legal: legítimo interesse. Você pode se opor pelo e-mail de contato.",
        "Registros de pedidos e pagamentos: cumprir obrigações fiscais e resolver eventuais disputas. Base legal: obrigação legal.",
      ],
    },
    {
      title: "Com quem compartilhamos",
      paragraphs: [
        "Não vendemos seus dados e não os usamos para publicidade de terceiros.",
        "Compartilhamos apenas com quem é necessário para o serviço funcionar: a hospedagem que roda nossos servidores e banco de dados, e o armazenamento das imagens do catálogo.",
        "Quando o pagamento pelo aplicativo estiver ativo, seu e-mail será enviado ao Mercado Pago para gerar a cobrança. Dados de cartão são tratados diretamente por eles e nunca passam pelos nossos servidores.",
      ],
    },
    {
      title: "Por quanto tempo guardamos",
      paragraphs: [
        "Dados da conta: enquanto ela existir.",
        "Registros de pedidos, reservas e pagamentos: pelo prazo exigido pela legislação fiscal, mesmo após a exclusão da conta, porém sem vínculo com pessoa identificável.",
        "Ações de uso: por até 24 meses.",
      ],
    },
    {
      title: "Seus direitos",
      paragraphs: [
        "Você pode, a qualquer momento e diretamente no aplicativo, em Perfil → Minha Conta: excluir sua conta e obter uma cópia de todos os dados que guardamos sobre você.",
        "Ao excluir a conta, apagamos na hora seu nome, e-mail, telefone e os endereços de entrega, e o acesso é bloqueado. Os pedidos já feitos permanecem no nosso registro sem ligação com você, porque precisamos deles para cumprir entregas contratadas e para a obrigação fiscal.",
        `Você também pode pedir correção de dados incorretos, informação sobre com quem compartilhamos, e revogar consentimentos, escrevendo para ${COMPANY.privacyEmail}. Respondemos em até 15 dias.`,
      ],
    },
    {
      title: "Segurança",
      paragraphs: [
        "O tráfego entre o aplicativo e nossos servidores é criptografado. As senhas são guardadas como hash e nunca em texto legível. O acesso ao painel administrativo é restrito e registrado.",
        "Nenhum sistema é infalível. Se ocorrer um incidente que possa gerar risco relevante a você, comunicaremos você e a Autoridade Nacional de Proteção de Dados.",
      ],
    },
    {
      title: "Menores de idade",
      paragraphs: [
        "O aplicativo é destinado a maiores de 18 anos. Não coletamos dados de crianças e adolescentes de forma consciente. Se identificarmos um cadastro nessa situação, ele será excluído.",
      ],
    },
    {
      title: "Alterações desta política",
      paragraphs: [
        "Se mudarmos esta política, publicaremos a nova versão aqui e no aplicativo, com a data de atualização. Mudanças relevantes serão comunicadas antes de entrarem em vigor.",
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  slug: "termos",
  title: "Termos de Uso",
  version: TERMS_VERSION,
  updatedAt: TERMS_UPDATED_AT,
  intro:
    `Estes termos regem o uso do aplicativo ${COMPANY.tradeName} e a locação de artigos para festas. ` +
    "Ao criar sua conta, você declara que leu e concorda com eles.",
  sections: [
    {
      title: "O que a Festaê faz",
      paragraphs: [
        `A ${COMPANY.tradeName} aluga artigos para festas — decoração, mobiliário, louças, iluminação e brinquedos —, avulsos ou em kits.`,
        "Pelo aplicativo você monta um orçamento, escolhe a data e solicita a reserva. A reserva só está confirmada quando nossa equipe confirmar, o que depende da disponibilidade dos itens na data pedida.",
      ],
    },
    {
      title: "Sua conta",
      paragraphs: [
        "Você é responsável pelas informações que fornece e por manter sua senha em sigilo. Avise-nos se suspeitar de uso indevido da sua conta.",
        "É preciso ter ao menos 18 anos para criar conta e contratar.",
      ],
    },
    {
      title: "Preços, pagamento e cancelamento",
      paragraphs: [
        "Os valores exibidos no aplicativo são uma estimativa. O valor final é confirmado após a definição da data, do endereço e das condições de entrega.",
        "PENDENTE — condições de pagamento (percentual na reserva e percentual na entrega) a definir com o jurídico.",
        "PENDENTE — política de cancelamento e reembolso por faixa de antecedência a definir com o jurídico.",
      ],
    },
    {
      title: "Entrega, montagem e devolução",
      paragraphs: [
        "PENDENTE — definir se haverá apenas retirada, ou retirada e entrega, e se haverá cobrança de frete.",
        "Os itens são cedidos em locação, não vendidos. Devem ser devolvidos nas condições em que foram entregues, ressalvado o desgaste natural de uso.",
        "Danos, perdas ou devolução fora do prazo combinado podem gerar cobrança adicional, informada previamente.",
      ],
    },
    {
      title: "Uso adequado dos itens",
      paragraphs: [
        "Os itens devem ser usados para a finalidade a que se destinam e no local informado na reserva. Não podem ser sublocados ou levados a outro endereço sem aviso.",
        "A segurança das pessoas durante o evento é responsabilidade de quem contrata, especialmente no uso de brinquedos e equipamentos elétricos.",
      ],
    },
    {
      title: "Parceiros",
      paragraphs: [
        "PENDENTE — definir se a Festaê apenas recomenda parceiros ou também intermedia pagamentos. Enquanto não houver definição, o aplicativo não exibe parceiros.",
      ],
    },
    {
      title: "Limites da nossa responsabilidade",
      paragraphs: [
        "Fazemos o possível para manter o aplicativo disponível, mas ele pode ficar fora do ar por manutenção ou por falha de serviços de terceiros.",
        "Não respondemos por eventos alheios ao nosso controle que impeçam a entrega, como fenômenos climáticos severos e interdições de via. Nesses casos, buscaremos uma alternativa com você ou devolveremos os valores pagos.",
      ],
    },
    {
      title: "Encerramento",
      paragraphs: [
        "Você pode excluir sua conta a qualquer momento pelo aplicativo, em Perfil → Minha Conta.",
        "Podemos encerrar contas que descumpram estes termos, resguardadas as obrigações já contratadas.",
      ],
    },
    {
      title: "Foro",
      paragraphs: [
        `Aplica-se a lei brasileira. Fica eleito o foro da comarca de ${COMPANY.city}/${COMPANY.state}, sem prejuízo do direito do consumidor de acionar o foro do seu domicílio.`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = [PRIVACY_POLICY, TERMS_OF_USE] as const;
