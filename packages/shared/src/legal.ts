/**
 * Política de Privacidade e Termos de Uso da Festaê.
 *
 * ATENÇÃO: este texto foi escrito a partir do que o código realmente faz —
 * quais dados são coletados, para quê e por quanto tempo — e das decisões
 * comerciais oficiais da empresa. É factualmente correto, mas **ainda merece
 * revisão de um advogado antes de publicar nas lojas**: o que está aqui
 * descreve corretamente o serviço, um advogado confere se descreve de forma
 * que proteja a Festaê num conflito.
 *
 * Fonte única: o aplicativo e a página pública renderizam este mesmo
 * conteúdo. Alterar o texto exige subir TERMS_VERSION — é ela que fica
 * gravada no aceite de cada usuário.
 */

import { ASSEMBLY_FEE, DELIVERY_CITY, DELIVERY_FEE, DELIVERY_WITH_ASSEMBLY_FEE } from "./pricing";

/** Sobe a cada alteração de conteúdo. Gravada no aceite do usuário. */
export const TERMS_VERSION = "1.3.0";

/** Data da última alteração do texto. Guardada em ISO para ordenar/comparar. */
export const TERMS_UPDATED_AT = "2026-08-07";

/** ISO vira dd/mm/aaaa — é assim que a data é lida no Brasil. */
export function formatLegalDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return day && month && year ? `${day}/${month}/${year}` : isoDate;
}

/** Formata reais para o texto legal, com a vírgula que se lê no Brasil. */
function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

// Dados cadastrais conforme o cartão CNPJ. As lojas conferem se o
// responsável declarado aqui bate com o titular da conta de desenvolvedor.
export const COMPANY = {
  legalName: "68.155.380 MARIA LUIZA POCAI",
  tradeName: "Festaê",
  taxId: "68.155.380/0001-77",
  address: "Rua Coronel Manoel dos Passos Maia, 68, Apto 505, Jardim Itália, CEP 89802-080",
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
        "Ao montar uma festa: data do evento, cidade, quantidade de convidados, tema escolhido e, quando você opta por entrega, o endereço e o bairro.",
        "Ao usar o aplicativo: registramos ações do seu percurso — cadastro, login, escolha de tema, escolha de kit, item adicionado, clique no WhatsApp, reserva criada, pagamento e desistência — para entender onde as pessoas travam e melhorar o serviço.",
        "Seu orçamento em construção fica guardado apenas no seu aparelho até virar um pedido.",
        "Não coletamos CPF, data de nascimento nem localização por GPS. Hoje o aplicativo não pede acesso à sua localização, câmera, contatos ou fotos.",
        "Quando a simulação de decoração por inteligência artificial for lançada, passará a existir o envio de fotos do espaço da sua festa — sempre por escolha sua, com pedido de permissão no momento do envio. As regras desse uso estão na seção \"Fotos que você envia\", mais abaixo.",
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
      title: "Fotos que você envia",
      paragraphs: [
        "Esta seção descreve, desde já, como trataremos as fotos enviadas para a simulação de decoração por inteligência artificial. O recurso ainda não está disponível; publicamos a regra antes para que você saiba o compromisso no momento em que decidir usá-lo.",
        "Finalidade: as imagens que você enviar serão utilizadas exclusivamente para gerar a visualização de decoração que você solicitou e para melhorar a experiência dessa ferramenta dentro do aplicativo.",
        "Elas não serão utilizadas para nenhuma outra finalidade — divulgação, portfólio, redes sociais, material de venda ou treinamento de modelos de terceiros — sem a sua autorização expressa e específica, pedida em separado no momento em que fizer sentido.",
        "O envio é sempre uma escolha sua, feito foto a foto. Base legal: consentimento. Você pode revogar esse consentimento a qualquer momento, e nesse caso apagamos as imagens.",
        "As imagens não são vendidas nem compartilhadas com terceiros para fins próprios deles. Se um serviço de processamento de imagem for necessário para gerar a visualização, ele atuará como nosso operador, apenas executando a tarefa que pedimos.",
        "Você pode excluir as imagens enviadas a qualquer momento pelo aplicativo, e a exclusão da sua conta apaga todas elas.",
      ],
    },
    {
      title: "Por quanto tempo guardamos",
      paragraphs: [
        "Dados da conta: enquanto ela existir.",
        "Registros de pedidos, reservas e pagamentos: pelo prazo exigido pela legislação fiscal, mesmo após a exclusão da conta, porém sem vínculo com pessoa identificável.",
        "Ações de uso: por até 24 meses.",
        "Fotos enviadas para simulação de decoração: até você apagá-las, revogar o consentimento ou excluir a conta.",
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
      title: "Preços e pagamento",
      paragraphs: [
        "O valor final do pedido é a soma dos produtos escolhidos, mais as taxas da forma de entrega que você escolher. O resumo mostra cada parcela dessa conta antes de você confirmar.",
        "O pagamento é feito em duas parcelas iguais: 50% no ato da reserva, que é o que garante a data, e 50% na retirada dos itens.",
        "A forma de pagamento aceita é Pix. Pagamento com cartão será oferecido em versão futura do aplicativo.",
        "A data só fica reservada depois que o pagamento dos primeiros 50% for confirmado.",
      ],
    },
    {
      title: "Cancelamento e reembolso",
      paragraphs: [
        "Se você precisar cancelar, o reembolso do que já foi pago segue a antecedência em relação à data da festa:",
        "Mais de 15 dias de antecedência: devolvemos 100% do valor pago.",
        "De 15 a 8 dias de antecedência: devolvemos 75% do valor pago.",
        "De 7 a 3 dias de antecedência: devolvemos 50% do valor pago.",
        "Menos de 72 horas antes da festa: não há reembolso, porque a data já ficou bloqueada para outros clientes e os itens já foram separados.",
        "A contagem considera a data e a hora em que você nos comunica o cancelamento, por escrito, pelo WhatsApp ou pelo e-mail de contato. O reembolso é feito por Pix na mesma chave usada no pagamento, em até 10 dias úteis.",
        "Se quem cancelar for a Festaê, por qualquer motivo, devolvemos 100% do valor pago, independentemente da antecedência.",
      ],
    },
    {
      title: "Retirada, entrega e montagem",
      paragraphs: [
        "A retirada na sede da Festaê é gratuita e é a forma padrão de receber os itens, nos horários combinados na confirmação da reserva.",
        `A entrega no local da festa custa ${formatBRL(DELIVERY_FEE)} e está disponível apenas em ${DELIVERY_CITY}. Para festas em outras cidades, a retirada é feita na sede. A taxa aparece no resumo antes de você confirmar, e a entrega depende da disponibilidade da equipe na data.`,
        `A montagem da decoração no local é feita pela equipe da Festaê e só está disponível junto com a entrega, pelo total de ${formatBRL(DELIVERY_WITH_ASSEMBLY_FEE)} — ${formatBRL(DELIVERY_FEE)} da entrega mais ${formatBRL(ASSEMBLY_FEE)} da montagem. Não há montagem para pedidos retirados na sede, porque quem monta é a equipe que leva os itens até o local.`,
        "A opção escolhida aparece no resumo do pedido, com o valor de cada parcela, e entra no total antes do cálculo do sinal.",
        "Os itens são cedidos em locação, não vendidos. Devem ser devolvidos nas condições em que foram recebidos, ressalvado o desgaste natural de uso.",
        "A devolução fora do prazo combinado pode gerar cobrança adicional pelo período extra, informada previamente.",
      ],
    },
    {
      title: "Responsabilidade pelos itens alugados",
      paragraphs: [
        "A responsabilidade pelos bens locados é sua desde o momento da retirada — ou da entrega, quando houver — até a devolução à Festaê.",
        "Em caso de dano, perda ou extravio, a Festaê poderá cobrar o valor correspondente ao reparo ou à reposição do item, conforme avaliação. A avaliação é apresentada a você com a descrição do que ocorreu e o valor cobrado antes de qualquer cobrança.",
        "Desgaste natural de uso não é considerado dano.",
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
        "O aplicativo ainda não exibe parceiros. Quando exibir, deixaremos claro em cada indicação se a Festaê apenas recomenda o parceiro ou se também intermedia a contratação, e o que cabe a cada um em caso de problema.",
      ],
    },
    {
      title: "Simulação de decoração por inteligência artificial",
      paragraphs: [
        "Esta seção vale a partir do momento em que o recurso estiver disponível no aplicativo. Hoje ele ainda não existe, e o aplicativo não pede acesso às suas fotos.",
        "Quando existir, você poderá enviar uma foto do espaço da sua festa para ver como ficaria com a nossa decoração. O envio é sempre uma escolha sua: nada é enviado automaticamente e o aplicativo funciona normalmente sem isso.",
        "As imagens enviadas serão usadas exclusivamente para gerar a visualização que você pediu e para melhorar a qualidade dessa ferramenta dentro do aplicativo. Não serão usadas para nenhuma outra finalidade — incluindo divulgação, portfólio, redes sociais ou material de venda — sem a sua autorização expressa e específica.",
        "As imagens não são vendidas, não são compartilhadas com terceiros para fins próprios deles e podem ser excluídas a qualquer momento por você. Excluir a conta apaga também as imagens enviadas.",
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
