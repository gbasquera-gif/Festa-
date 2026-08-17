import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Casca HTML da versão web. Roda só no build, não no aplicativo das lojas.
 *
 * Existe por causa de um problema real observado em teste: sem declarar o
 * idioma, o Chrome tentou adivinhar, achou que a página não era portuguesa e
 * "traduziu" para português — virando "Início" em "Não se trata de uma
 * questão de..." e "Iluminação" em "À medida que a ia...". Para quem abre o
 * link sem saber do que se trata, o app parecia quebrado.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover para o conteúdo alcançar as bordas em celular
            com notch; user-scalable=no só travaria o zoom de quem precisa. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />

        <meta
          name="description"
          content="Locação de artigos para festas em Chapecó. Monte sua festa, reserve a data e pague o sinal pelo aplicativo."
        />
        {/* Cor da barra do navegador no celular — o mesmo azul da marca. */}
        <meta name="theme-color" content="#12314F" />

        {/* O cartão que o WhatsApp monta quando alguém encaminha o link.
            Sem isto ele mostra a URL crua do Railway, que não diz nada e
            ainda parece link suspeito — justo no canal por onde o teste
            com pessoas de fora vai circular. */}
        <meta property="og:title" content="Festaê — Locação de artigos para festas" />
        <meta
          property="og:description"
          content="Monte sua festa, reserve a data e pague o sinal pelo aplicativo. Chapecó/SC."
        />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:site_name" content="Festaê" />
        <meta property="og:url" content="https://reservas.festaechapeco.com.br" />

        {/* A imagem do cartão. Sem ela o WhatsApp mostrava só texto sobre
            fundo cinza — num canal onde o link é encaminhado de mãe para mãe,
            é a diferença entre parecer uma loja e parecer um link solto.
            1200 × 630 é a proporção que as redes recortam; endereço absoluto
            porque quem monta o cartão é o servidor delas, não o navegador. */}
        <meta
          property="og:image"
          content="https://reservas.festaechapeco.com.br/og-festae.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Festaê — Pegue, monte, comemore" />
        <meta name="twitter:card" content="summary_large_image" />

        {/* Permite "adicionar à tela de início" no iPhone e no Android, que é
            como as pessoas do teste vão querer voltar ao app. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Festaê" />
        {/* O iPhone ignora o favicon ao salvar na tela de início e usa esta
            imagem. Sem ela, o atalho vira uma miniatura da página. */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
