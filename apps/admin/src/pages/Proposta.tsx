import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EVENT_TYPE_META,
  TIPO_DA_LINHA_LABEL,
  formatarDataDaFesta,
  isEventType,
  type TipoDaLinha,
} from "@festae/shared";

/**
 * A proposta como a cliente vê.
 *
 * Fora do painel de propósito: sem menu, sem login, sem nada que lembre um
 * sistema administrativo. A pessoa abre isto pelo WhatsApp, quase sempre no
 * celular, e o que ela precisa sentir é que a festa dela já está sendo
 * pensada — não que recebeu um documento para conferir.
 *
 * Por isso a ordem: quem somos, quem está por trás, o nosso jeito, a SUA
 * festa, o investimento. O preço vem depois de a proposta já ter valor.
 *
 * Nenhum texto institucional é escrito aqui. Tudo vem de `conteudo`, editável
 * no painel — e bloco sem conteúdo simplesmente não aparece, em vez de exibir
 * um título vazio prometendo o que ninguém escreveu.
 */

type Bloco = { titulo: string | null; texto: string | null; imagemUrl: string | null };

type PropostaPublica = {
  numero: number;
  versao: number;
  situacao: string;
  podeAprovar: boolean;
  cliente: { nome: string };
  festa: { em: string; tipo: string; cidade: string; local: string | null; convidados: number | null };
  tema: string | null;
  kit: string | null;
  imagens: string[];
  observacoes: string | null;
  mostrarValores: boolean;
  itens: {
    tipo: string; descricao: string; quantidade: number;
    valorUnitario: number | null; total: number | null; imagemUrl: string | null;
  }[];
  valores: {
    subtotal: number | null; desconto: number; entrega: number | null;
    montagem: number | null; total: number;
  };
  validoAte: string;
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
  sinal: {
    percentual: number;
    valor: number;
    saldo: number;
    recebido: number;
    pago: boolean;
    pix: { chave: string | null; favorecido: string | null; instrucao: string | null };
  };
  conteudo: Record<string, Bloco>;
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (v: number) => BRL.format(v);

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api/v1";

async function buscar(token: string): Promise<PropostaPublica> {
  const r = await fetch(`${API}/proposta/${token}`);
  if (!r.ok) throw new Error("Proposta não encontrada.");
  return r.json();
}

export default function Proposta({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const { data: p, isLoading, error } = useQuery<PropostaPublica>({
    queryKey: ["proposta", token],
    queryFn: () => buscar(token),
    retry: false,
  });

  /**
   * A aba da cliente não diz "Gestão".
   *
   * A proposta pública é servida pelo mesmo aplicativo do painel, então ela
   * herdava o título de lá. Quem abre o link é a cliente, e o que aparece na
   * aba dela — e no que ela compartilha — tem de ser a Festaê, não o nome do
   * sistema interno.
   */
  useEffect(() => {
    const anterior = document.title;
    document.title = "Sua proposta · Festaê";
    return () => { document.title = anterior; };
  }, []);

  const aprovar = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/proposta/${token}/aprovar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Não foi possível aprovar.");
      return r.json();
    },
    onSuccess: () => {
      setConfirmando(false);
      queryClient.invalidateQueries({ queryKey: ["proposta", token] });
    },
  });

  if (isLoading) {
    return <Centro>Abrindo sua proposta…</Centro>;
  }
  if (error || !p) {
    return (
      <Centro>
        Não encontramos esta proposta. Se o link veio da Festaê, fale com a gente pelo WhatsApp que
        mandamos um novo.
      </Centro>
    );
  }

  const bloco = (chave: string) => p.conteudo?.[chave];
  /**
   * A arte da capa.
   *
   * Primeiro a imagem institucional; depois a própria inspiração da festa,
   * que é foto de verdade da proposta; e, se não houver nenhuma, a arte da
   * marca. A arte da marca já traz logo e frase impressos, então nela o
   * texto NÃO vai por cima — dois títulos e dois logotipos na mesma imagem
   * é o que transforma uma capa bonita em cartaz confuso.
   */
  const arteDaCapa = bloco("capa")?.imagemUrl || p.imagens[0] || null;

  const galeriaDaFestae = (bloco("galeria")?.texto ?? "")
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const tipo = isEventType(p.festa.tipo)
    ? EVENT_TYPE_META[p.festa.tipo as keyof typeof EVENT_TYPE_META].label
    : p.festa.tipo;

  return (
    <div className="proposta">
      {/* CAPA
        *
        * A arte ocupa a largura inteira e o texto vive sobre ela: a capa
        * anterior empilhava marca, título, dados e só então a imagem, e o
        * resultado era meia tela de espaço vazio antes de a festa aparecer.
        * Quem abre isto no celular tem de ver a festa no primeiro instante,
        * não um cabeçalho. */}
      <header className="proposta-capa">
        <div className={`proposta-capa-arte${arteDaCapa ? "" : " proposta-capa-marca"}`}>
          <img src={arteDaCapa ?? "/banner-proposito.webp"} alt="" className="proposta-hero" />
          <div className="proposta-capa-texto">
            <img src="/marca-festae.webp" alt="Festaê" width={1983} height={793} className="proposta-marca" />
            <p className="proposta-eyebrow">Proposta nº {p.numero}</p>
            <h1>
              Uma festa pensada para
              <br />
              <strong>{p.cliente.nome}</strong>
            </h1>
            <p className="proposta-data">
              {tipo} · {formatarDataDaFesta(p.festa.em)} · {p.festa.cidade}
            </p>
          </div>
        </div>
        <p className="proposta-slogan">Sua festa linda, sem complicação.</p>
      </header>

      <main className="proposta-corpo">
        <Institucional chave="apresentacao" bloco={bloco("apresentacao")} padrao="Conheça a Festaê" />
        <Institucional chave="historia" bloco={bloco("historia")} padrao="Nossa história" />
        <Institucional chave="quem" bloco={bloco("quem")} padrao="Quem está por trás" retrato />
        <Institucional chave="jeito" bloco={bloco("jeito")} padrao="Nosso jeito de fazer" />

        {/* Festas já feitas. Sem fotos, a seção não existe. */}
        {galeriaDaFestae.length > 0 && (
          <section className="proposta-secao" data-bloco="galeria">
            <p className="proposta-eyebrow">{bloco("galeria")?.titulo || "Festas que já fizemos"}</p>
            <div className="proposta-galeria">
              {galeriaDaFestae.map((url) => (
                <img key={url} src={url} alt="" loading="lazy" />
              ))}
            </div>
          </section>
        )}

        {/* COMO IMAGINAMOS SUA FESTA
          *
          * Antes da lista de itens, e com a primeira imagem grande: é a parte
          * que faz a cliente ver a festa dela. Uma tabela de peças não
          * emociona ninguém; uma foto do que vai ficar pronto, sim. */}
        {p.imagens.length > 0 && (
          <section className="proposta-secao proposta-inspiracao">
            <p className="proposta-eyebrow">Como imaginamos sua festa</p>
            <h2>{p.tema ? p.tema : "Uma inspiração para o seu dia"}</h2>
            {p.observacoes && <p className="proposta-texto">{p.observacoes}</p>}
            {/* A principal sempre grande; o resto em colunas iguais, que é o
              * que mantém a página elegante com uma, duas ou seis fotos. Uma
              * miniatura solta embaixo da grande parecia sobra. */}
            <img className="proposta-inspiracao-capa" src={p.imagens[0]} alt="" />
            {p.imagens.length > 1 && (
              <div
                className="proposta-mosaico"
                data-quantas={Math.min(p.imagens.length - 1, 3)}
              >
                {p.imagens.slice(1).map((url) => (
                  <img key={url} src={url} alt="" loading="lazy" />
                ))}
              </div>
            )}
          </section>
        )}

        {/* SUA FESTA */}
        <section className="proposta-secao">
          <p className="proposta-eyebrow">O que está incluído</p>
          <h2>{p.imagens.length > 0 ? "A composição" : p.tema ? p.tema : "A proposta para o seu dia"}</h2>
          {p.observacoes && p.imagens.length === 0 && (
            <p className="proposta-texto">{p.observacoes}</p>
          )}

          <ul className={`proposta-itens${p.mostrarValores ? "" : " proposta-itens-sem-valor"}`}>
            {p.itens.map((i, n) => (
              <li key={n}>
                <span className="proposta-item-nome">
                  {i.quantidade > 1 ? `${i.quantidade}× ` : ""}
                  {i.descricao}
                  <span className="proposta-item-tipo">
                    {TIPO_DA_LINHA_LABEL[i.tipo as TipoDaLinha] ?? i.tipo}
                  </span>
                </span>
                {i.total !== null && <span className="proposta-item-valor">{brl(i.total)}</span>}
              </li>
            ))}
          </ul>
          {!p.mostrarValores && (
            <p className="proposta-texto proposta-itens-nota">
              Tudo isso está incluído no investimento da sua festa.
            </p>
          )}
        </section>

        {/* INVESTIMENTO
          *
          * O fechamento da proposta: um número, grande, com as condições
          * logo abaixo. A conta detalhada só aparece quando a proposta
          * mostra preço por linha — senão seria decompor o conjunto no
          * exato lugar em que ele deveria ser lido inteiro. */}
        <section className="proposta-secao proposta-investimento">
          <p className="proposta-eyebrow">Investimento</p>
          <p className="proposta-total">
            <span>Investimento total da sua festa</span>
            <strong>{brl(p.valores.total)}</strong>
          </p>

          {p.mostrarValores && (
            <dl>
              {p.valores.subtotal !== null && (
                <div><dt>Composição</dt><dd>{brl(p.valores.subtotal)}</dd></div>
              )}
              {p.valores.desconto > 0 && <div><dt>Desconto</dt><dd>− {brl(p.valores.desconto)}</dd></div>}
              {p.valores.entrega !== null && p.valores.entrega > 0 && (
                <div><dt>Entrega</dt><dd>{brl(p.valores.entrega)}</dd></div>
              )}
              {p.valores.montagem !== null && p.valores.montagem > 0 && (
                <div><dt>Montagem</dt><dd>{brl(p.valores.montagem)}</dd></div>
              )}
            </dl>
          )}

          <div className="proposta-condicoes">
            <p className="proposta-eyebrow">Condições</p>
            <p className="proposta-texto">
              Sinal de {p.sinal.percentual.toLocaleString("pt-BR")}% —{" "}
              <strong>{brl(p.sinal.valor)}</strong> — para reservar a data. O saldo de{" "}
              {brl(p.sinal.saldo)} fica para a retirada ou a entrega.
            </p>
            <p className="proposta-texto">
              Proposta válida até <strong>{formatarDataDaFesta(p.validoAte)}</strong>.
            </p>
            {bloco("condicoes")?.texto && <p className="proposta-texto">{bloco("condicoes")!.texto}</p>}
          </div>
        </section>

        {/* APROVAÇÃO */}
        <section className="proposta-secao proposta-cta">
          {p.aprovadoEm ? (
            <>
              <h2>{p.sinal.pago ? "Sua data está reservada 💛" : "Que alegria ter você com a gente 💛"}</h2>
              <p className="proposta-texto">
                {p.sinal.pago
                  ? `Sinal confirmado pela Festaê. Sua data está reservada e já começamos a preparar tudo. Aprovada por ${p.aprovadoPorNome} em ${new Date(p.aprovadoEm).toLocaleDateString("pt-BR")}.`
                  : `Proposta aprovada por ${p.aprovadoPorNome} em ${new Date(p.aprovadoEm).toLocaleDateString("pt-BR")}. Agora falta só um passo para reservar sua data.`}
              </p>
            </>
          ) : p.podeAprovar ? (
            <>
              <h2>Vamos deixar sua festa linda?</h2>
              <p className="proposta-texto">
                Ao aprovar, você confirma a composição e o valor desta proposta. Em seguida
                mostramos o sinal que reserva a sua data — a aprovação sozinha ainda não reserva.
              </p>
              {!confirmando ? (
                <button type="button" className="proposta-botao" onClick={() => setConfirmando(true)}>
                  Quero aprovar minha festa
                </button>
              ) : (
                <div className="proposta-confirmar">
                  <p className="proposta-resumo">
                    <strong>{p.cliente.nome}</strong> · {formatarDataDaFesta(p.festa.em)} ·{" "}
                    {p.itens.length} {p.itens.length === 1 ? "item" : "itens"} ·{" "}
                    <strong>{brl(p.valores.total)}</strong>
                  </p>
                  <label>
                    Seu nome
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Como devemos chamar você"
                      autoComplete="name"
                    />
                  </label>
                  <button
                    type="button"
                    className="proposta-botao"
                    disabled={nome.trim().length < 2 || aprovar.isPending}
                    onClick={() => aprovar.mutate()}
                  >
                    {aprovar.isPending ? "Confirmando…" : "Confirmar aprovação"}
                  </button>
                  {aprovar.error && (
                    <p className="proposta-erro">{(aprovar.error as Error).message}</p>
                  )}
                  <p className="proposta-nota">
                    Registramos seu nome, a data e o valor aprovado. É o registro da sua confirmação
                    — não é assinatura eletrônica com valor jurídico.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <h2>Esta proposta expirou</h2>
              <p className="proposta-texto">
                O prazo desta proposta passou. Fale com a Festaê pelo WhatsApp que preparamos uma
                atualizada para você.
              </p>
            </>
          )}
        </section>
      </main>

      {/* RESERVE SUA DATA
        *
        * Só aparece depois do aceite, e some quando o sinal é confirmado.
        * Aprovar não é pagar: a proposta aprovada fica aguardando o sinal, e
        * quem confirma o recebimento é a Festaê no painel — não este botão. */}
      {p.aprovadoEm && !p.sinal.pago && p.sinal.valor > 0 && (
        <section className="proposta-sinal">
          <div className="proposta-sinal-caixa">
            <p className="proposta-eyebrow">Reserve sua data</p>
            <h2>Agora falta só um passo para reservar sua data 💛</h2>
            <p className="proposta-texto">
              Realize o sinal abaixo e, após a confirmação do pagamento pela Festaê, sua data
              estará reservada. O restante você paga na retirada ou na entrega.
            </p>

            <dl className="proposta-sinal-conta">
              <div>
                <dt>Total aprovado</dt>
                <dd>{brl(p.valores.total)}</dd>
              </div>
              <div>
                <dt>Sinal ({p.sinal.percentual.toLocaleString("pt-BR")}%)</dt>
                <dd className="proposta-sinal-valor">{brl(p.sinal.valor)}</dd>
              </div>
              <div>
                <dt>Saldo na retirada ou entrega</dt>
                <dd>{brl(p.sinal.saldo)}</dd>
              </div>
            </dl>

            {p.sinal.pix.chave ? (
              <div className="proposta-pix">
                <p className="proposta-eyebrow">Pix</p>
                {p.sinal.pix.favorecido && (
                  <p className="proposta-pix-favorecido">{p.sinal.pix.favorecido}</p>
                )}
                <div className="proposta-pix-chave">
                  <code>{p.sinal.pix.chave}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(p.sinal.pix.chave ?? "");
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 2500);
                    }}
                  >
                    {copiado ? "Copiada!" : "Copiar chave"}
                  </button>
                </div>
                <p className="proposta-texto proposta-pix-instrucao">
                  {p.sinal.pix.instrucao ??
                    `Faça o Pix de ${brl(p.sinal.valor)} para a chave acima e envie o comprovante para a Festaê no WhatsApp. Assim que confirmarmos, sua data está reservada.`}
                </p>
              </div>
            ) : (
              <p className="proposta-texto">
                Fale com a Festaê no WhatsApp para combinar o pagamento do sinal.
              </p>
            )}

            <p className="proposta-nota">
              A data é reservada quando a Festaê confirma o recebimento do sinal. Esta página não
              processa pagamento.
            </p>
          </div>
        </section>
      )}

      <footer className="proposta-rodape">
        <img src="/marca-festae.webp" alt="Festaê" width={1983} height={793} />
        <p>Pegue • Monte • Comemore</p>
      </footer>
    </div>
  );
}

function Institucional({
  chave,
  bloco,
  padrao,
  retrato,
}: {
  chave: string;
  bloco?: Bloco;
  padrao: string;
  retrato?: boolean;
}) {
  // Bloco sem texto e sem foto não vira seção: título sozinho anuncia um
  // conteúdo que não existe, e isso desmonta a proposta inteira.
  if (!bloco || (!bloco.texto && !bloco.imagemUrl)) return null;
  return (
    <section className={`proposta-secao${retrato ? " proposta-retrato" : ""}`} data-bloco={chave}>
      <p className="proposta-eyebrow">{bloco.titulo || padrao}</p>
      {bloco.imagemUrl && <img src={bloco.imagemUrl} alt="" loading="lazy" />}
      {bloco.texto && <p className="proposta-texto">{bloco.texto}</p>}
    </section>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="proposta">
      <div className="proposta-centro">{children}</div>
    </div>
  );
}
