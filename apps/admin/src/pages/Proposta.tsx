import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EVENT_TYPE_META,
  TIPO_DA_LINHA_LABEL,
  formatarDataDaFesta,
  isEventType,
  type TipoDaLinha,
  PECAS_EM_UMA_LINHA,
  textoDaComposicao,
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

type Item = {
  tipo: string; descricao: string; quantidade: number;
  valorUnitario: number | null; total: number | null; imagemUrl: string | null;
};

/** Uma opção de festa, como a cliente vê. */
type Opcao = {
  id: string;
  nome: string;
  descricao: string | null;
  kit: string | null;
  /** O que vem no kit, como a proposta foi enviada. Nulo quando não há registro. */
  composicaoDoKit: { productId: string; nome: string; quantidade: number }[] | null;
  imagens: string[];
  itens: Item[];
  valores: {
    subtotal: number | null; desconto: number; entrega: number | null;
    montagem: number | null; total: number;
  };
  /** O sinal se a cliente escolher esta opção. */
  sinal: { percentual: number; valor: number; saldo: number };
};

type PropostaPublica = {
  numero: number;
  versao: number;
  situacao: string;
  podeAprovar: boolean;
  cliente: { nome: string };
  /** Para quem é a festa: o festejado, ou a cliente quando ele não foi informado. */
  festaPara: string;
  festa: { em: string; tipo: string; cidade: string; local: string | null; convidados: number | null };
  tema: string | null;
  opcoes: Opcao[];
  opcaoAprovadaId: string | null;
  opcaoAprovadaNome: string | null;
  observacoes: string | null;
  mostrarValores: boolean;
  validoAte: string;
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
  /** O sinal da opção de referência — depois do aceite, a escolhida. */
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
  /**
   * A opção que a cliente está olhando para aprovar. Trocar é livre até
   * confirmar; depois do aceite, quem manda é o que o servidor registrou.
   */
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);

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
        body: JSON.stringify({ nome, opcaoId: escolhidaId ?? p?.opcoes[0]?.id }),
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
  const varias = p.opcoes.length > 1;
  const aprovada = p.opcoes.find((o) => o.id === p.opcaoAprovadaId) ?? null;
  /**
   * A opção mostrada inteira, no formato de sempre: a única, ou a aprovada.
   * Com várias opções e nenhuma aprovada, a página vira escolha.
   */
  const emFoco: Opcao | null = varias ? aprovada : p.opcoes[0] ?? null;
  const escolhida = varias && !aprovada ? p.opcoes.find((o) => o.id === escolhidaId) ?? null : null;
  const posicao = (o: Opcao) => p.opcoes.findIndex((x) => x.id === o.id) + 1;

  /**
   * A arte da capa.
   *
   * Primeiro a imagem institucional; depois a própria inspiração da festa,
   * que é foto de verdade da proposta; e, se não houver nenhuma, a arte da
   * marca. A arte da marca já traz logo e frase impressos, então nela o
   * texto NÃO vai por cima — dois títulos e dois logotipos na mesma imagem
   * é o que transforma uma capa bonita em cartaz confuso.
   */
  const arteDaCapa =
    bloco("capa")?.imagemUrl ||
    (emFoco ?? p.opcoes[0])?.imagens[0] ||
    p.opcoes.find((o) => o.imagens.length > 0)?.imagens[0] ||
    null;

  const galeriaDaFestae = (bloco("galeria")?.texto ?? "")
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean);
  const tipo = isEventType(p.festa.tipo)
    ? EVENT_TYPE_META[p.festa.tipo as keyof typeof EVENT_TYPE_META].label
    : p.festa.tipo;

  function escolher(o: Opcao) {
    setEscolhidaId(o.id);
    setConfirmando(false);
  }
  function irParaAprovacao(abrir: boolean) {
    if (abrir) setConfirmando(true);
    document.getElementById("aprovar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`proposta${escolhida && p.podeAprovar ? " proposta-com-barra" : ""}`}>
      {/* CAPA
        *
        * A arte ocupa a largura inteira e o texto vive sobre ela: quem abre
        * isto no celular tem de ver a festa no primeiro instante, não um
        * cabeçalho. */}
      <header className="proposta-capa">
        <div className={`proposta-capa-arte${arteDaCapa ? "" : " proposta-capa-marca"}`}>
          <img src={arteDaCapa ?? "/banner-proposito.webp"} alt="" className="proposta-hero" />
          <div className="proposta-capa-texto">
            <img src="/marca-festae.webp" alt="Festaê" width={1983} height={793} className="proposta-marca" />
            <p className="proposta-eyebrow">Proposta nº {p.numero}</p>
            <h1>
              Uma festa pensada para
              <br />
              <strong>{p.festaPara}</strong>
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

        {emFoco ? (
          <>
            {/* COMO IMAGINAMOS SUA FESTA
              *
              * Antes da lista de itens, e com a primeira imagem grande: é a
              * parte que faz a cliente ver a festa dela. */}
            {emFoco.imagens.length > 0 && (
              <section className="proposta-secao proposta-inspiracao">
                <p className="proposta-eyebrow">
                  {varias ? `Opção escolhida · ${emFoco.nome}` : "Como imaginamos sua festa"}
                </p>
                <h2>{p.tema ? p.tema : "Uma inspiração para o seu dia"}</h2>
                {p.observacoes && <p className="proposta-texto">{p.observacoes}</p>}
                <Imagens imagens={emFoco.imagens} />
              </section>
            )}

            {/* SUA FESTA */}
            <section className="proposta-secao">
              <p className="proposta-eyebrow">
                {varias && emFoco.imagens.length === 0 ? `Opção escolhida · ${emFoco.nome}` : "O que está incluído"}
              </p>
              <h2>{emFoco.imagens.length > 0 ? "A composição" : p.tema ? p.tema : "A proposta para o seu dia"}</h2>
              {emFoco.descricao && <p className="proposta-texto">{emFoco.descricao}</p>}
              {p.observacoes && emFoco.imagens.length === 0 && (
                <p className="proposta-texto">{p.observacoes}</p>
              )}
              <Itens opcao={emFoco} mostrarValores={p.mostrarValores} />
              {!p.mostrarValores && (
                <p className="proposta-texto proposta-itens-nota">
                  Tudo isso está incluído no investimento da sua festa.
                </p>
              )}
            </section>

            {/* INVESTIMENTO
              *
              * O fechamento da proposta: um número, grande, com as condições
              * logo abaixo. */}
            <section className="proposta-secao proposta-investimento">
              <p className="proposta-eyebrow">Investimento</p>
              <p className="proposta-total">
                <span>Investimento total da sua festa</span>
                <strong>{brl(emFoco.valores.total)}</strong>
              </p>
              {p.mostrarValores && <ContaDaOpcao opcao={emFoco} />}
              <Condicoes
                texto={`Sinal de ${emFoco.sinal.percentual.toLocaleString("pt-BR")}%`}
                valor={emFoco.sinal.valor}
                saldo={emFoco.sinal.saldo}
                validoAte={p.validoAte}
                condicoes={bloco("condicoes")?.texto ?? null}
              />
            </section>
          </>
        ) : (
          <>
            {/* AS OPÇÕES
              *
              * Uma debaixo da outra, cada uma inteira — fotos, o que vem, o
              * investimento — e um botão para escolher. Lado a lado caberia
              * no computador e viraria uma tabela ilegível no celular, que é
              * onde a cliente abre isto. */}
            <section className="proposta-secao proposta-escolha" id="opcoes">
              <p className="proposta-eyebrow">{p.opcoes.length} opções para a sua festa</p>
              <h2>Escolha a opção que combina com sua festa</h2>
              {p.tema && <p className="proposta-texto">Tema: {p.tema}</p>}
              {p.observacoes && <p className="proposta-texto">{p.observacoes}</p>}

              <div className="proposta-opcoes">
                {p.opcoes.map((o, n) => {
                  const esta = escolhida?.id === o.id;
                  return (
                    <article key={o.id} className={`proposta-opcao${esta ? " proposta-opcao-escolhida" : ""}`} data-opcao={o.nome}>
                      {o.imagens.length > 0 && (
                        <div className="proposta-opcao-imagens">
                          <Imagens imagens={o.imagens} />
                        </div>
                      )}
                      <div className="proposta-opcao-corpo">
                        <p className="proposta-eyebrow">Opção {n + 1}</p>
                        <h3>{o.nome}</h3>
                        {o.descricao && <p className="proposta-texto">{o.descricao}</p>}
                        <Itens opcao={o} mostrarValores={p.mostrarValores} />
                        {p.mostrarValores && <ContaDaOpcao opcao={o} />}
                        <p className="proposta-opcao-investimento">
                          <span>Investimento</span>
                          <strong>{brl(o.valores.total)}</strong>
                        </p>
                        <p className="proposta-opcao-sinal">
                          Sinal de {brl(o.sinal.valor)} para reservar a data
                        </p>
                        {p.podeAprovar && (
                          <button
                            type="button"
                            className={`proposta-botao${esta ? " proposta-botao-marcado" : ""}`}
                            aria-pressed={esta}
                            onClick={() => (esta ? irParaAprovacao(false) : escolher(o))}
                          >
                            {esta ? "✓ Opção escolhida" : "Escolher esta opção"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="proposta-secao proposta-investimento">
              <Condicoes
                texto={`Sinal de ${p.opcoes[0].sinal.percentual.toLocaleString("pt-BR")}% do valor da opção escolhida`}
                valor={escolhida ? escolhida.sinal.valor : null}
                saldo={escolhida ? escolhida.sinal.saldo : null}
                validoAte={p.validoAte}
                condicoes={bloco("condicoes")?.texto ?? null}
              />
            </section>
          </>
        )}

        {/* APROVAÇÃO */}
        <section className="proposta-secao proposta-cta" id="aprovar">
          {p.aprovadoEm ? (
            <>
              <h2>{p.sinal.pago ? "Sua data está reservada 💛" : "Que alegria ter você com a gente 💛"}</h2>
              <p className="proposta-texto">
                {p.sinal.pago
                  ? `Sinal confirmado pela Festaê. Sua data está reservada e já começamos a preparar tudo. Aprovada por ${p.aprovadoPorNome} em ${new Date(p.aprovadoEm).toLocaleDateString("pt-BR")}.`
                  : `Proposta aprovada por ${p.aprovadoPorNome} em ${new Date(p.aprovadoEm).toLocaleDateString("pt-BR")}. Agora falta só um passo para reservar sua data.`}
              </p>
              {varias && aprovada && (
                <p className="proposta-texto">
                  Opção aprovada: <strong>{aprovada.nome}</strong> — {brl(aprovada.valores.total)}.
                </p>
              )}
            </>
          ) : p.podeAprovar && varias && !escolhida ? (
            <>
              <h2>Qual opção combina com sua festa?</h2>
              <p className="proposta-texto">
                Escolha uma das opções acima. Depois você confere a escolha e confirma — dá para
                trocar até confirmar.
              </p>
              <button type="button" className="proposta-botao" onClick={() => document.getElementById("opcoes")?.scrollIntoView({ behavior: "smooth" })}>
                Ver as opções
              </button>
            </>
          ) : p.podeAprovar ? (
            <>
              <h2>Vamos deixar sua festa linda?</h2>
              {escolhida ? (
                <div className="proposta-escolhida">
                  <p className="proposta-eyebrow">Você escolheu</p>
                  <p className="proposta-escolhida-nome">
                    Opção {posicao(escolhida)} — {escolhida.nome}
                  </p>
                  <p className="proposta-escolhida-valor">{brl(escolhida.valores.total)}</p>
                  <button type="button" className="proposta-link" onClick={() => document.getElementById("opcoes")?.scrollIntoView({ behavior: "smooth" })}>
                    Trocar de opção
                  </button>
                </div>
              ) : (
                <p className="proposta-texto">
                  Ao aprovar, você confirma a composição e o valor desta proposta. Em seguida
                  mostramos o sinal que reserva a sua data — a aprovação sozinha ainda não reserva.
                </p>
              )}
              {!confirmando ? (
                <button type="button" className="proposta-botao" onClick={() => setConfirmando(true)}>
                  {escolhida ? "Confirmar e aprovar esta opção" : "Quero aprovar minha festa"}
                </button>
              ) : (
                <div className="proposta-confirmar">
                  <p className="proposta-resumo">
                    <strong>{p.festaPara}</strong> · {formatarDataDaFesta(p.festa.em)} ·{" "}
                    {escolhida ? (
                      <>{escolhida.nome} · </>
                    ) : (
                      <>{emFoco?.itens.length ?? 0} {emFoco?.itens.length === 1 ? "item" : "itens"} · </>
                    )}
                    <strong>{brl((escolhida ?? emFoco)?.valores.total ?? 0)}</strong>
                  </p>
                  <label>
                    Seu nome
                    <input
                      id="nome-aprovacao"
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
                    Registramos seu nome, a data, {escolhida ? "a opção escolhida " : ""}e o valor
                    aprovado. É o registro da sua confirmação — não é assinatura eletrônica com
                    valor jurídico.
                    {escolhida ? " Depois de confirmar, a opção não pode mais ser trocada por aqui." : ""}
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
        * Aprovar não é pagar: quem confirma o recebimento é a Festaê no
        * painel — não este botão. */}
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
                <dd>{brl(emFoco?.valores.total ?? 0)}</dd>
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

      {/* A escolha sempre à mão: com as opções longas, o botão de aprovar
          fica lá embaixo. A barra lembra o que foi escolhido e leva até ele. */}
      {escolhida && p.podeAprovar && (
        <div className="proposta-barra" role="region" aria-label="Opção escolhida">
          <span className="proposta-barra-texto">
            <span>Você escolheu</span>
            <strong>{escolhida.nome} · {brl(escolhida.valores.total)}</strong>
          </span>
          <button type="button" onClick={() => irParaAprovacao(true)}>Aprovar</button>
        </div>
      )}
    </div>
  );
}

/** A primeira imagem grande; o resto em colunas iguais. */
function Imagens({ imagens }: { imagens: string[] }) {
  return (
    <>
      <img className="proposta-inspiracao-capa" src={imagens[0]} alt="" />
      {imagens.length > 1 && (
        <div className="proposta-mosaico" data-quantas={Math.min(imagens.length - 1, 3)}>
          {imagens.slice(1).map((url) => (
            <img key={url} src={url} alt="" loading="lazy" />
          ))}
        </div>
      )}
    </>
  );
}

/** O que está incluído numa opção, com a composição do kit junto da linha do kit. */
function Itens({ opcao, mostrarValores }: { opcao: Opcao; mostrarValores: boolean }) {
  return (
    <ul className={`proposta-itens${mostrarValores ? "" : " proposta-itens-sem-valor"}`}>
      {opcao.itens.map((i, n) => (
        <li key={n}>
          <span className="proposta-item-nome">
            {i.quantidade > 1 ? `${i.quantidade}× ` : ""}
            {i.descricao}
            <span className="proposta-item-tipo">
              {TIPO_DA_LINHA_LABEL[i.tipo as TipoDaLinha] ?? i.tipo}
            </span>
            {/* O que vem dentro do kit, junto da linha do kit. Só para ler:
                não tem preço, o kit é o que está sendo cobrado. */}
            {i.tipo === "KIT" && n === opcao.itens.findIndex((x) => x.tipo === "KIT") && opcao.composicaoDoKit && opcao.composicaoDoKit.length > 0 && (
              <ComposicaoNaProposta itens={opcao.composicaoDoKit} />
            )}
          </span>
          {i.total !== null && <span className="proposta-item-valor">{brl(i.total)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** A conta aberta, só quando a proposta mostra preço por linha. */
function ContaDaOpcao({ opcao }: { opcao: Opcao }) {
  const v = opcao.valores;
  return (
    <dl>
      {v.subtotal !== null && <div><dt>Composição</dt><dd>{brl(v.subtotal)}</dd></div>}
      {v.desconto > 0 && <div><dt>Desconto</dt><dd>− {brl(v.desconto)}</dd></div>}
      {v.entrega !== null && v.entrega > 0 && <div><dt>Entrega</dt><dd>{brl(v.entrega)}</dd></div>}
      {v.montagem !== null && v.montagem > 0 && <div><dt>Montagem</dt><dd>{brl(v.montagem)}</dd></div>}
    </dl>
  );
}

function Condicoes({
  texto,
  valor,
  saldo,
  validoAte,
  condicoes,
}: {
  texto: string;
  valor: number | null;
  saldo: number | null;
  validoAte: string;
  condicoes: string | null;
}) {
  return (
    <div className="proposta-condicoes">
      <p className="proposta-eyebrow">Condições</p>
      <p className="proposta-texto">
        {texto}
        {valor !== null && saldo !== null ? (
          <>
            {" — "}<strong>{brl(valor)}</strong> — para reservar a data. O saldo de {brl(saldo)} fica para a
            retirada ou a entrega.
          </>
        ) : (
          <> para reservar a data. O saldo fica para a retirada ou a entrega.</>
        )}
      </p>
      <p className="proposta-texto">
        Proposta válida até <strong>{formatarDataDaFesta(validoAte)}</strong>.
      </p>
      {condicoes && <p className="proposta-texto">{condicoes}</p>}
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

/** "Inclui: 1 Painel · 2 Cilindros", ou lista quando o kit tem muitas peças. */
function ComposicaoNaProposta({ itens }: { itens: { productId: string; nome: string; quantidade: number }[] }) {
  return (
    <span className="proposta-kit-composicao">
      <span className="proposta-kit-composicao-rotulo">Inclui</span>
      {itens.length <= PECAS_EM_UMA_LINHA ? (
        <span className="proposta-kit-composicao-linha">{textoDaComposicao(itens)}</span>
      ) : (
        <span className="proposta-kit-composicao-lista">
          {itens.map((i) => (
            <span key={i.productId}>
              {i.quantidade} {i.nome}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
