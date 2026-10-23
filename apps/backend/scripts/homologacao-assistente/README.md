# Homologação do Assistente IA

Testa a interpretação do assistente com a **OpenAI real**, no **banco local**, sem publicar nada.

## O que confere

`perguntas.mjs` faz 40 perguntas:

- 13 de Financeiro, incluindo retiradas dos sócios e pró-labore;
- 8 de Reservas;
- 4 de Orçamentos;
- 3 de Acervo;
- 8 de Despesas por fornecedor e por categoria (D1 a D8);
- 4 de limites.

Inclui datas relativas (amanhã, próximo sábado, mês passado, mês que vem, este ano) e quatro sequências ("E no mês passado?", "E quantas delas já estão pagas?", "E qual foi a conversão?", "E em outubro?").

As perguntas de despesas usam os **dados fictícios** que `dados-ficticios.mjs` carrega pela API (`ficticios.mjs`). São despesas do mês passado e do dia 1º do mês atual, de fornecedores e categorias inventados com cara de dado pessoal, e descrições com CPF, e-mail e telefone também inventados. A carga não se repete no mesmo banco.

Para cada resposta, compara com as rotas que as telas do painel usam:

1. A ferramenta chamada é a certa.
2. O período foi interpretado corretamente.
3. O número esperado aparece na resposta.
4. **Nenhum número da resposta deixa de existir nos dados que as ferramentas devolveram**, ou seja, o assistente não inventa números.
5. Recusas e limitações saem sem valores em reais.
6. Só ADMIN usa o assistente nesta fase: em todas as rotas, OPS recebe 403 e quem não está logado recebe 401 (pergunta X2, sem custo de IA).
7. **P1, privacidade:** o servidor de homologação guarda, só na memória, cada envio feito à OpenAI. No fim, a P1 confere:
   - nenhum nome fictício (fornecedor, categoria) nas instruções nem nos resultados de ferramenta;
   - nenhum e-mail, telefone ou CPF fictício em mensagem nenhuma, nem na pergunta.

   A pergunta e as respostas do modelo podem repetir o nome que a pessoa digitou. O que vem do banco, não. O verificador tem autoteste: um vazamento de exemplo precisa ser pego antes da rodada começar.

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

Custo estimado de uma rodada: menos de US$ 0,60 (cerca de 44 perguntas e 4 falas curtas).

O resultado detalhado vai para a pasta temporária do sistema, fora do repositório, porque as respostas trazem primeiros nomes e valores.

O servidor de homologação se recusa a rodar com banco que não seja `localhost` ou com `NODE_ENV=production`.
