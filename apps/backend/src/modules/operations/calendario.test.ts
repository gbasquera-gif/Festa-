import { describe, expect, it } from "vitest";
import {
  descricaoDaFesta,
  gerarIcs,
  linkGoogleAgenda,
  tituloDaFesta,
  type FestaNoCalendario,
} from "./calendario";

const festa: FestaNoCalendario = {
  reservaId: "res123",
  cliente: "Maria Silva",
  telefone: "49999990000",
  tema: "Safari",
  data: new Date("2026-10-15T12:00:00Z"),
  entrega: true,
  montagem: true,
  endereco: "Rua das Flores, 100",
  cidade: "Chapecó",
  total: 890,
  saldo: 445,
  linkDoPainel: "https://painel.festae/reservas",
};

const agora = new Date("2026-09-07T12:00:00Z");

describe("tituloDaFesta", () => {
  it("segue o formato pedido pela operação", () => {
    expect(tituloDaFesta(festa)).toBe("Festaê — Safari | Maria Silva");
  });

  it("sem tema, não deixa um travessão solto no título", () => {
    expect(tituloDaFesta({ ...festa, tema: null })).toBe("Festaê — Maria Silva");
  });
});

/**
 * `toLocaleString` separa "R$" do número com espaço fino (U+00A0), que é o
 * certo tipograficamente mas atrapalha a comparação literal do teste.
 */
const semEspacoFino = (t: string) => t.replace(/\u00A0/g, " ");

describe("descricaoDaFesta", () => {
  it("traz o que a operação precisa no dia", () => {
    const texto = semEspacoFino(descricaoDaFesta(festa));
    expect(texto).toContain("Maria Silva");
    expect(texto).toContain("49999990000");
    expect(texto).toContain("Entrega no local");
    expect(texto).toContain("Com montagem");
    expect(texto).toContain("Rua das Flores, 100");
    expect(texto).toContain("R$ 890,00");
    expect(texto).toContain("https://painel.festae/reservas");
  });

  it("diz retirada quando não há entrega, e omite o endereço", () => {
    const texto = descricaoDaFesta({ ...festa, entrega: false });
    expect(texto).toContain("Retirada na sede");
    expect(texto).not.toContain("Rua das Flores");
  });

  it("saldo zerado vira 'pago integralmente', não 'R$ 0,00'", () => {
    expect(descricaoDaFesta({ ...festa, saldo: 0 })).toContain("Pago integralmente");
  });

  it("não inventa telefone quando não há", () => {
    expect(descricaoDaFesta({ ...festa, telefone: null })).not.toContain("Telefone:");
  });
});

describe("gerarIcs", () => {
  const ics = gerarIcs(festa, agora);

  it("é um calendário válido de um evento só", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  // O formato exige CRLF. Com LF sozinho, alguns aplicativos recusam o
  // arquivo sem dizer por quê.
  it("quebra linha com CRLF", () => {
    expect(ics.includes("\r\n")).toBe(true);
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });

  // A Festaê não guarda a hora da festa. Cravar um horário colocaria na
  // agenda uma informação que ninguém combinou.
  it("marca o dia inteiro, sem inventar horário", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(ics).toContain("DTEND;VALUE=DATE:20261016");
  });

  it("leva os três avisos pedidos", () => {
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
  });

  it("o identificador é estável, para reimportar atualizar em vez de duplicar", () => {
    expect(ics).toContain("UID:reserva-res123@festaechapeco.com.br");
    expect(gerarIcs(festa, new Date("2027-01-01T00:00:00Z"))).toContain("UID:reserva-res123@");
  });

  // Vírgula e ponto e vírgula são separadores no formato: um nome como
  // "Silva, Maria" quebraria o arquivo inteiro sem escape.
  it("escapa vírgula e ponto e vírgula do texto livre", () => {
    const comVirgula = gerarIcs({ ...festa, cliente: "Silva, Maria; Filha" }, agora);
    expect(comVirgula).toContain("Silva\\, Maria\\; Filha");
  });

  it("nenhuma linha passa de 75 octetos", () => {
    for (const linha of gerarIcs(festa, agora).split("\r\n")) {
      expect(Buffer.from(linha, "utf8").length).toBeLessThanOrEqual(75);
    }
  });

  it("põe o endereço no local quando há entrega, e a sede quando não há", () => {
    expect(ics).toContain("LOCATION:Rua das Flores");
    expect(gerarIcs({ ...festa, entrega: false }, agora)).toContain("LOCATION:Retirada na sede");
  });
});

describe("linkGoogleAgenda", () => {
  it("abre o Google Agenda já preenchido", () => {
    const url = new URL(linkGoogleAgenda(festa));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261015/20261016");
    expect(url.searchParams.get("text")).toBe("Festaê — Safari | Maria Silva");
    expect(url.searchParams.get("details")).toContain("Maria Silva");
  });
});
