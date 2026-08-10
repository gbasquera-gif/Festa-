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

        {/* Permite "adicionar à tela de início" no iPhone e no Android, que é
            como as pessoas do teste vão querer voltar ao app. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Festaê" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
