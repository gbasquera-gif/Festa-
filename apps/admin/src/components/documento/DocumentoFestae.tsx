import { COMPANY, FESTAE_CONTATO } from "@festae/shared";
import { ALLURA_WOFF2_BASE64 } from "@/pages/assinatura-manuscrita";

/**
 * As peças da folha que sai da Festaê para a cliente.
 *
 * O comprovante foi o primeiro papel; o Voucher de Crédito é o segundo, e
 * precisa sair como o mesmo papel — mesma marca, mesma letra, mesma
 * assinatura. Por isso as peças moram aqui, uma vez só: um voucher com estilo
 * próprio seria uma segunda identidade visual, e a cliente desconfiaria do
 * documento que parece diferente do que ela já recebeu.
 */

/**
 * Telefone como se lê em voz alta: (49) 99123-4567.
 *
 * O banco guarda o que a operação digitou, com ou sem máscara. Num documento
 * que a cliente confere, um "49991234567" corrido é onde o olho tropeça — e
 * é o número pelo qual ela vai ser chamada no dia da festa.
 */
export function telefoneLegivel(bruto: string): string {
  const d = bruto.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return bruto;
}

export function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="linha-dado">
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

/** Imprimir ou salvar em PDF: no celular, é o mesmo menu que compartilha. */
export function AcoesDoDocumento() {
  return (
    <div className="acoes-do-comprovante">
      <button type="button" onClick={() => window.print()} className="botao-principal">
        Imprimir ou salvar em PDF
      </button>
    </div>
  );
}

/** A assinatura da Maria Luiza, igual em todo papel da Festaê. */
export function AssinaturaFestae({ declaracao }: { declaracao: string }) {
  return (
    <section className="assinatura">
      {/* O nome vem acima do fio, como assinatura sobre linha de
          assinatura, e repetido em letra de imprensa abaixo — é assim que
          um documento assinado se lê, e é o que permite conferir o nome
          quando a letra cursiva não entrega uma letra. */}
      <p className="marca-assinatura">Maria Luiza Pocai</p>
      <p className="linha-assinatura" />
      <p className="quem-assina">
        Maria Luiza Pocai · {COMPANY.tradeName} · CNPJ {COMPANY.taxId}
      </p>
      <p className="emitido-por">{declaracao}</p>
    </section>
  );
}

/**
 * Marca e contatos comerciais da Festaê, e a linha final própria de cada
 * documento.
 *
 * Sem endereço físico, de propósito: o endereço cadastrado é residencial, e
 * estes papéis circulam — a cliente encaminha, imprime, guarda no celular.
 * Quem precisa falar com a Festaê tem telefone, e-mail, site e Instagram.
 */
export function RodapeFestae({ nota }: { nota: React.ReactNode }) {
  return (
    <footer className="rodape">
      <p className="rodape-empresa">{COMPANY.tradeName} · Sua festa linda, sem complicação</p>
      <p className="rodape-contatos">
        {FESTAE_CONTATO.telefone} · {FESTAE_CONTATO.email} · {FESTAE_CONTATO.site} ·{" "}
        {FESTAE_CONTATO.instagram}
      </p>
      <p className="rodape-termos">{nota}</p>
    </footer>
  );
}

/**
 * Estilo do documento.
 *
 * Marinho estrutura, coral marca o número que importa, dourado faz os fios
 * finos que dão ao papel o ar de documento e não de recibo de mercado. O
 * creme é o fundo — na tela ele aquece, e na impressão some, porque tinta de
 * fundo em folha inteira é cartucho gasto à toa.
 */
export const CSS_DO_DOCUMENTO = `
@font-face {
  font-family: "Assinatura Festae";
  src: url(data:font/woff2;base64,${ALLURA_WOFF2_BASE64}) format("woff2");
  font-weight: 400;
  font-display: block;
}
.acoes-do-comprovante {
  display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
}
.acoes-do-comprovante button {
  min-height: 44px; padding: 0 20px; border-radius: 999px;
  font: 600 15px/1 "Nunito", system-ui, sans-serif; cursor: pointer; border: 1px solid transparent;
}
.botao-principal { background: #14304C; color: #fff; }
.botao-secundario { background: transparent; color: #14304C; border-color: #E8DCC8; }
.aviso-sem-pagamento {
  margin: 0 0 16px; padding: 12px 14px; border-radius: 12px;
  background: #FDF3E7; border: 1px solid #D3A24E; color: #6B4A12;
  font: 400 14px/1.5 "Nunito", system-ui, sans-serif; max-width: 820px;
}

.folha {
  --navy: #14304C; --coral: #F2674C; --gold: #D3A24E;
  --cream: #FBF6EE; --linen: #F3EADC; --sand: #E8DCC8;
  box-sizing: border-box;
  width: 100%; max-width: 820px; margin: 0;
  background: var(--cream); color: var(--navy);
  border: 1px solid var(--sand); border-radius: 16px;
  padding: 32px 30px 24px;
  font: 400 14px/1.55 "Nunito", system-ui, -apple-system, sans-serif;
}
.folha * { box-sizing: border-box; }

.tarja-cancelada {
  margin: -8px 0 20px; padding: 8px 14px; border-radius: 8px;
  background: #FBE9E7; color: #B3261E; border: 1px solid #E7A9A2;
  font-weight: 700; text-align: center; letter-spacing: .04em; text-transform: uppercase;
}

.cabecalho {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 20px; padding-bottom: 18px; border-bottom: 2px solid var(--gold);
}
.logo { width: 148px; height: auto; }
.identificacao { text-align: right; }
.titulo-documento {
  margin: 0; max-width: 260px; font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em; color: #56708C;
}
.numero-contrato {
  margin: 4px 0 0; font-size: 26px; font-weight: 800; color: var(--coral);
  letter-spacing: .02em; font-variant-numeric: tabular-nums;
}
.emitido { margin: 2px 0 0; font-size: 12px; color: #56708C; }

.declaracao {
  margin: 20px 0 22px; font-size: 17px; line-height: 1.5;
  padding: 14px 16px; background: var(--linen); border-radius: 12px;
  border-left: 4px solid var(--coral);
}
.declaracao strong { font-weight: 800; }

.colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 640px) { .colunas { grid-template-columns: 1fr; } }

.bloco { margin-bottom: 20px; }
.bloco h2 {
  margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .09em; color: var(--gold);
  padding-bottom: 5px; border-bottom: 1px solid var(--sand);
}
.bloco dl { margin: 0; }
.linha-dado {
  display: flex; justify-content: space-between; gap: 14px;
  padding: 3px 0; align-items: baseline;
}
.linha-dado dt { margin: 0; color: #56708C; font-size: 13px; flex-shrink: 0; }
.linha-dado dd { margin: 0; text-align: right; font-weight: 600; min-width: 0; word-break: break-word; }

.itens { list-style: none; margin: 0; padding: 0; }
.itens li {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 6px 0; border-bottom: 1px dotted var(--sand);
}
.itens li:last-child { border-bottom: none; }
.item-nome { min-width: 0; }
.itens-duas-colunas,
.itens-tres-colunas { display: grid; column-gap: 22px; }
.itens-duas-colunas { grid-template-columns: 1fr 1fr; }
.itens-tres-colunas { grid-template-columns: 1fr 1fr 1fr; column-gap: 16px; }
.itens-tres-colunas .item-nome { font-size: 13px; }
/* No celular as colunas espremeriam os nomes; lá a folha rola. */
@media (max-width: 640px) {
  .itens-duas-colunas,
  .itens-tres-colunas { grid-template-columns: 1fr; }
}
.quantidade { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.vazio { color: #56708C; font-style: italic; border-bottom: none !important; }

.placar { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
/* No celular os dois valores empilham: lado a lado eles estouravam a folha,
   e a operação lê este documento no telefone antes de enviar. No papel a
   largura sempre dá, então a impressão volta às duas colunas. */
@media (max-width: 640px) { .placar { grid-template-columns: 1fr; } }
@media print { .placar { grid-template-columns: 1fr 1fr !important; } }
.placar-item {
  padding: 14px 16px; border-radius: 12px; text-align: center;
  display: flex; flex-direction: column; gap: 2px;
}
.placar-item span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; }
.placar-item strong { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
.placar-item.pago { background: var(--navy); color: #fff; }
.placar-item.pago span { color: #A9C2DC; }
.placar-item.saldo { background: #fff; border: 2px solid var(--coral); color: var(--coral); }
.placar-item.saldo span { color: #B9503C; }
/* Quitado é notícia boa: fio dourado e tinta calma, não a borda de alerta. */
.placar-item.quitado { background: #fff; border: 2px solid var(--gold); color: #6B4A12; }
.placar-item.quitado span { color: #8A6A2C; }
.placar-item.quitado strong { font-size: 20px; }

.nota-saldo { margin: 10px 0 0; font-size: 13px; color: #56708C; }

.pagamentos { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
.pagamentos td { padding: 5px 0; border-bottom: 1px dotted var(--sand); color: #56708C; }
.pagamentos td:last-child { color: var(--navy); }

.observacoes { margin: 0; white-space: pre-wrap; }

.assinatura { margin-top: 26px; padding-top: 18px; border-top: 2px solid var(--gold); text-align: center; }
/* A cursiva tem hastes que descem abaixo da linha de base (o "z" do Luiza).
   O padding embaixo é o que impede o fio da assinatura de cortá-las. */
.marca-assinatura {
  margin: 0; padding-bottom: 6px;
  font-family: "Assinatura Festae", "Segoe Script", cursive;
  font-size: 40px; font-weight: 400; color: var(--navy);
  line-height: 1.1; letter-spacing: .01em;
}
.linha-assinatura {
  width: 260px; margin: 0 auto 8px; border-bottom: 1px solid var(--navy);
}
.quem-assina { margin: 0; font-size: 12px; color: #56708C; line-height: 1.5; }
.emitido-por { margin: 10px auto 0; max-width: 460px; font-size: 11px; color: #7A8FA6; line-height: 1.5; }

.rodape { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--sand); text-align: center; }
.rodape p { margin: 2px 0; font-size: 11px; color: #7A8FA6; line-height: 1.5; }
.rodape-contatos { font-weight: 700; color: var(--navy) !important; font-size: 12px !important; }

@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden; }
  #comprovante, #comprovante * { visibility: visible; }
  #comprovante {
    position: absolute; left: 0; top: 0; width: 100%; max-width: none;
    border: none; border-radius: 0; padding: 0;
    background: #fff;
    font-size: 9pt;
  }
  /* Compactação só do papel. Um comprovante que vira duas folhas, com a
     segunda carregando apenas a assinatura, é folha e tinta gastas — e
     chega na cliente com cara de documento mal feito. Na tela o espaço
     continua largo, porque lá ele não custa nada. */
  #comprovante .logo { width: 88px; }
  #comprovante .cabecalho { padding-bottom: 9px; }
  #comprovante .numero-contrato { font-size: 19px; }
  #comprovante .declaracao { margin: 8px 0; padding: 6px 10px; font-size: 11px; }
  #comprovante .colunas { gap: 14px; }
  #comprovante .bloco { margin-bottom: 7px; }
  #comprovante .bloco h2 { margin-bottom: 5px; padding-bottom: 3px; }
  #comprovante .linha-dado { padding: 1.5px 0; }
  #comprovante .itens li { padding: 3px 0; }
  #comprovante .itens-duas-colunas { grid-template-columns: 1fr 1fr !important; }
  #comprovante .itens-tres-colunas { grid-template-columns: 1fr 1fr 1fr !important; }
  #comprovante .placar { margin-top: 8px; gap: 8px; }
  #comprovante .placar-item { padding: 6px 12px; }
  #comprovante .placar-item strong { font-size: 17px; }
  #comprovante .nota-saldo { margin-top: 7px; }
  #comprovante .pagamentos { margin-top: 8px; }
  #comprovante .placar-item.quitado strong { font-size: 16px; }
  #comprovante .assinatura { margin-top: 9px; padding-top: 8px; }
  #comprovante .marca-assinatura { font-size: 27px; padding-bottom: 3px; }
  #comprovante .emitido-por { margin-top: 7px; }
  #comprovante .rodape { margin-top: 8px; padding-top: 7px; }
  #comprovante .linha-assinatura { margin-bottom: 6px; }
  #comprovante .emitido-por { font-size: 10px; }
  #comprovante .rodape p { font-size: 10px; }
  /* Fundo colorido em folha inteira é cartucho gasto; os blocos que
     carregam informação continuam com cor, porque neles a cor é o que
     separa o que foi pago do que falta. */
  .declaracao { background: #F3EADC !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .placar-item.pago { background: #14304C !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .placar-item.saldo { border-color: #F2674C !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .placar-item.quitado { border-color: #D3A24E !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .numero-contrato, .marca-assinatura { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .acoes-do-comprovante, .aviso-sem-pagamento { display: none !important; }
  .bloco, .assinatura, .placar { break-inside: avoid; }
}

/* ---- Voucher de Crédito e comprovante de saldo: as mesmas peças da folha. */
.depois-do-cabecalho { margin-top: 20px; }
/* "CRÉDITO Nº 00012" é mais longo que "FE-0042": numa linha só, um pouco menor. */
.numero-credito { font-size: 22px; }
.numero-credito span { white-space: nowrap; }
@media (max-width: 640px) { .numero-credito { font-size: 17px; } .identificacao { min-width: 0; } }
.valor-do-credito {
  margin: 0 0 20px; padding: 18px 16px; border-radius: 12px; text-align: center;
  background: var(--navy); color: #fff; display: flex; flex-direction: column; gap: 2px;
}
.valor-do-credito span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #A9C2DC; }
.valor-do-credito strong { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; }
.nota-do-voucher { margin: 0 0 6px; font-size: 13px; color: #56708C; }
.extrato-do-saldo { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.extrato-do-saldo th {
  text-align: left; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em;
  color: #56708C; padding: 4px 0; border-bottom: 1px solid var(--sand);
}
.extrato-do-saldo td { padding: 5px 0; border-bottom: 1px dotted var(--sand); vertical-align: top; }
.extrato-do-saldo .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 10px; }
@media print {
  .valor-do-credito { background: #14304C !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #comprovante .valor-do-credito { padding: 10px 12px; margin-bottom: 10px; }
  #comprovante .depois-do-cabecalho { margin-top: 10px; }
  #comprovante .numero-credito { font-size: 17px; }
  #comprovante .nota-do-voucher, #comprovante .extrato-do-saldo { font-size: 8.5pt; }
  #comprovante .valor-do-credito strong { font-size: 22px; }
}
`;
