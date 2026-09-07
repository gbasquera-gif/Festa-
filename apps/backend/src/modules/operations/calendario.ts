/**
 * Geração do arquivo de calendário de uma festa.
 *
 * É camada complementar, não fonte da verdade: o painel continua mandando.
 * Serve para a festa aparecer no celular da Maria Luiza junto do resto do
 * dia dela, com aviso antes — que é onde ela realmente olha de manhã.
 *
 * Texto puro montado à mão em vez de biblioteca: o formato iCalendar que
 * interessa aqui são vinte linhas, e uma dependência a mais no servidor
 * custaria mais do que resolve.
 */

export interface FestaNoCalendario {
  reservaId: string;
  cliente: string;
  telefone: string | null;
  tema: string | null;
  data: Date;
  entrega: boolean;
  montagem: boolean;
  endereco: string | null;
  cidade: string;
  total: number;
  saldo: number;
  linkDoPainel: string;
}

/** Avisos antes da festa, em dias. */
const ALARMES = [7, 3, 1];

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Escapa o que o formato iCalendar trata como separador.
 *
 * Um nome com vírgula ("Silva, Maria") ou um endereço com ponto e vírgula
 * quebra o arquivo inteiro em alguns aplicativos — o evento simplesmente não
 * importa, sem mensagem de erro.
 */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Data no formato do iCalendar, em UTC. */
function carimbo(data: Date): string {
  return `${data.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Dia inteiro, e não um horário inventado.
 *
 * A Festaê não guarda a hora da festa — só a data. Cravar "às 9h" para
 * preencher o campo colocaria no calendário uma informação que ninguém
 * combinou, e a operação acabaria se guiando por ela.
 */
function diaInteiro(data: Date): string {
  return data.toISOString().slice(0, 10).replace(/-/g, "");
}

export function descricaoDaFesta(f: FestaNoCalendario): string {
  const linhas = [
    `Cliente: ${f.cliente}`,
    f.telefone ? `Telefone: ${f.telefone}` : null,
    f.tema ? `Tema: ${f.tema}` : null,
    f.entrega ? "Entrega no local" : "Retirada na sede",
    f.montagem ? "Com montagem" : "Sem montagem",
    f.entrega && f.endereco ? `Endereço: ${f.endereco} — ${f.cidade}` : null,
    `Total: ${brl(f.total)}`,
    f.saldo > 0 ? `Saldo a receber: ${brl(f.saldo)}` : "Pago integralmente",
    "",
    `Abrir no painel: ${f.linkDoPainel}`,
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

export function tituloDaFesta(f: FestaNoCalendario): string {
  return f.tema ? `Festaê — ${f.tema} | ${f.cliente}` : `Festaê — ${f.cliente}`;
}

/**
 * Uma linha de iCalendar não pode passar de 75 octetos.
 *
 * Descrição longa sem dobra é o motivo clássico de o Outlook recusar um
 * arquivo que o Apple Calendar aceitou — e o erro só aparece do outro lado.
 */
function dobrar(linha: string): string {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;

  const partes: string[] = [];
  let atual = Buffer.alloc(0);
  for (const char of linha) {
    const b = Buffer.from(char, "utf8");
    const limite = partes.length === 0 ? 75 : 74;
    if (atual.length + b.length > limite) {
      partes.push(atual.toString("utf8"));
      atual = Buffer.alloc(0);
    }
    atual = Buffer.concat([atual, b]);
  }
  partes.push(atual.toString("utf8"));
  return partes.join("\r\n ");
}

export function gerarIcs(f: FestaNoCalendario, agora: Date = new Date()): string {
  const fim = new Date(f.data);
  fim.setUTCDate(fim.getUTCDate() + 1);

  const alarmes = ALARMES.flatMap((dias) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:-P${dias}D`,
    `DESCRIPTION:${escapar(`Festaê em ${dias} dia(s) — ${f.cliente}`)}`,
    "END:VALARM",
  ]);

  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Festae//Painel//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:reserva-${f.reservaId}@festaechapeco.com.br`,
    `DTSTAMP:${carimbo(agora)}`,
    `DTSTART;VALUE=DATE:${diaInteiro(f.data)}`,
    `DTEND;VALUE=DATE:${diaInteiro(fim)}`,
    `SUMMARY:${escapar(tituloDaFesta(f))}`,
    `DESCRIPTION:${escapar(descricaoDaFesta(f))}`,
    ...(f.entrega && f.endereco
      ? [`LOCATION:${escapar(`${f.endereco} — ${f.cidade}`)}`]
      : ["LOCATION:Retirada na sede da Festaê"]),
    `URL:${f.linkDoPainel}`,
    "STATUS:CONFIRMED",
    ...alarmes,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // CRLF é exigido pelo formato; alguns aplicativos recusam com LF sozinho.
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

/** Link que abre o Google Agenda já preenchido, para quem prefere um clique. */
export function linkGoogleAgenda(f: FestaNoCalendario): string {
  const fim = new Date(f.data);
  fim.setUTCDate(fim.getUTCDate() + 1);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: tituloDaFesta(f),
    dates: `${diaInteiro(f.data)}/${diaInteiro(fim)}`,
    details: descricaoDaFesta(f),
    location: f.entrega && f.endereco ? `${f.endereco} — ${f.cidade}` : "Retirada na sede da Festaê",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
