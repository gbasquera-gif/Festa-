# Homologação do Assistente IA

Testa a interpretação do assistente com a **OpenAI real**, no **banco local**, sem publicar nada.

## O que confere

`perguntas.mjs` faz 32 perguntas: 13 de Financeiro (retiradas dos sócios e pró-labore incluídos), 8 de Reservas, 4 de Orçamentos, 3 de Acervo e 4 de limites. Inclui datas relativas (amanhã, próximo sábado, mês passado, mês que vem, este ano) e três sequências ("E no mês passado?", "E quantas delas já estão pagas?", "E qual foi a conversão?").

Para cada resposta, compara com as rotas que as telas do painel usam:

1. A ferramenta chamada é a certa.
2. O período foi interpretado corretamente.
3. O número esperado aparece na resposta.
4. **Nenhum número da resposta deixa de existir nos dados que as ferramentas devolveram**, ou seja, o assistente não inventa números.
5. Recusas e limitações saem sem valores em reais.
6. Só ADMIN usa o assistente nesta fase: em todas as rotas, OPS recebe 403 e quem não está logado recebe 401 (pergunta X2, sem custo de IA).

`voz.mjs` fala 4 perguntas com a voz do servidor, manda o áudio para a transcrição e confere datas, valores e o período interpretado.

## Pré-requisitos

- Postgres local com as migrations aplicadas e algum dado. O seed de demonstração serve; quanto mais dado, melhor a cobertura. Os números esperados vêm do próprio banco.
- `pnpm turbo run build`.
- `OPENAI_API_KEY` **no ambiente**, nunca em arquivo do repositório nem no chat. Use um projeto da OpenAI só da Festaê, com limite de gasto baixo.
- Saída de rede para `api.openai.com`.
- `HOMOLOGACAO_OPS_EMAIL` e `HOMOLOGACAO_OPS_SENHA` de um usuário OPS **local**, para conferir o 403. Sem eles, a X2 falha avisando.

## Rodar

```bash
apps/backend/scripts/homologacao-assistente/executar.sh
```

Para uma rodada direcionada, `HOMOLOGACAO_PERGUNTAS="F1,F3,X1,X2,V3"` limita as perguntas de texto (F1…X4) e de voz (V1…V4).

Custo estimado de uma rodada: menos de US$ 0,50 (cerca de 36 perguntas e 4 falas curtas).

O resultado detalhado vai para a pasta temporária do sistema, fora do repositório, porque as respostas trazem primeiros nomes e valores.

O servidor de homologação se recusa a rodar com banco que não seja `localhost` ou com `NODE_ENV=production`.
