import { useState } from "react";
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
  itens: { tipo: string; descricao: string; quantidade: number; valorUnitario: number; total: number; imagemUrl: string | null }[];
  valores: { subtotal: number; desconto: number; entrega: number; montagem: number; total: number };
  validoAte: string;
  aprovadoEm: string | null;
  aprovadoPorNome: string | null;
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

  const { data: p, isLoading, error } = useQuery<PropostaPublica>({
    queryKey: ["proposta", token],
    queryFn: () => buscar(token),
    retry: false,
  });

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
  const tipo = isEventType(p.festa.tipo)
    ? EVENT_TYPE_META[p.festa.tipo as keyof typeof EVENT_TYPE_META].label
    : p.festa.tipo;

  return (
    <div className="proposta">
      {/* CAPA */}
      <header className="proposta-capa">
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
        <img src="/banner-proposito.webp" alt="" className="proposta-hero" />
        <p className="proposta-slogan">Sua festa linda, sem complicação.</p>
      </header>

      <main className="proposta-corpo">
        <Institucional chave="apresentacao" bloco={bloco("apresentacao")} padrao="Conheça a Festaê" />
        <Institucional chave="historia" bloco={bloco("historia")} padrao="Nossa história" />
        <Institucional chave="quem" bloco={bloco("quem")} padrao="Quem está por trás" retrato />
        <Institucional chave="jeito" bloco={bloco("jeito")} padrao="Nosso jeito de fazer" />

        {/* SUA FESTA */}
        <section className="proposta-secao">
          <p className="proposta-eyebrow">Sua festa</p>
          <h2>{p.tema ? p.tema : "A proposta para o seu dia"}</h2>
          {p.observacoes && <p className="proposta-texto">{p.observacoes}</p>}

          {p.imagens.length > 0 && (
            <div className="proposta-galeria">
              {p.imagens.map((url) => (
                <img key={url} src={url} alt="" loading="lazy" />
              ))}
            </div>
          )}

          <ul className="proposta-itens">
            {p.itens.map((i, n) => (
              <li key={n}>
                <span className="proposta-item-nome">
                  {i.quantidade > 1 ? `${i.quantidade}× ` : ""}
                  {i.descricao}
                  <span className="proposta-item-tipo">
                    {TIPO_DA_LINHA_LABEL[i.tipo as TipoDaLinha] ?? i.tipo}
                  </span>
                </span>
                <span className="proposta-item-valor">{brl(i.total)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* INVESTIMENTO */}
        <section className="proposta-secao proposta-investimento">
          <p className="proposta-eyebrow">Investimento</p>
          <dl>
            <div><dt>Composição</dt><dd>{brl(p.valores.subtotal)}</dd></div>
            {p.valores.desconto > 0 && <div><dt>Desconto</dt><dd>− {brl(p.valores.desconto)}</dd></div>}
            {p.valores.entrega > 0 && <div><dt>Entrega</dt><dd>{brl(p.valores.entrega)}</dd></div>}
            {p.valores.montagem > 0 && <div><dt>Montagem</dt><dd>{brl(p.valores.montagem)}</dd></div>}
          </dl>
          <p className="proposta-total">
            <span>Total</span>
            <strong>{brl(p.valores.total)}</strong>
          </p>
        </section>

        {/* CONDIÇÕES */}
        <section className="proposta-secao proposta-condicoes">
          <p className="proposta-eyebrow">Condições</p>
          <p className="proposta-texto">
            Esta proposta vale até <strong>{formatarDataDaFesta(p.validoAte)}</strong>.
          </p>
          {bloco("condicoes")?.texto && <p className="proposta-texto">{bloco("condicoes")!.texto}</p>}
        </section>

        {/* APROVAÇÃO */}
        <section className="proposta-secao proposta-cta">
          {p.aprovadoEm ? (
            <>
              <h2>Sua festa está confirmada com a gente 🎉</h2>
              <p className="proposta-texto">
                Aprovada por {p.aprovadoPorNome} em{" "}
                {new Date(p.aprovadoEm).toLocaleDateString("pt-BR")}. A Festaê entra em contato para
                combinar os próximos passos.
              </p>
            </>
          ) : p.podeAprovar ? (
            <>
              <h2>Vamos deixar sua festa linda?</h2>
              <p className="proposta-texto">
                Ao aprovar, você confirma a composição e o valor desta proposta. A Festaê fala com
                você para combinar pagamento e detalhes.
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
