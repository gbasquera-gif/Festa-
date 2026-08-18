# Diagnóstico de produto e proposta da Sprint 3

Documento de decisão, escrito depois de reler o produto inteiro com a
pergunta: *o que impede uma pessoa de baixar o app, montar a festa em três
minutos, reservar e pagar o sinal?*

Data: 07/08/2026 · Sprint 2 encerrada · MVP não lançado

---

## 1. A conclusão em um parágrafo

O produto está tecnicamente bem construído e **comercialmente travado por
quatro coisas**, nenhuma delas difícil: o catálogo está atrás do login, o
aplicativo promete entrega quando a operação é retirada, o pagamento do sinal
não funciona de verdade, e a Maria Luiza não tem como trabalhar uma reserva
depois que ela chega. Resolver essas quatro coisas é a Sprint 3 inteira.
Tudo o mais é backlog.

---

## 2. Se eu fosse o primeiro cliente, eu pagaria hoje?

**Não — e não chegaria perto de pagar.** Três motivos, em ordem de gravidade:

**Eu não conseguiria ver um único preço sem criar conta.** `app/(tabs)/_layout.tsx`
e `app/catalogo/_layout.tsx` redirecionam para o login. Alguém que ouviu falar
da Festaê baixa o app, cai numa tela de cadastro e é obrigado a entregar nome,
e-mail e senha para descobrir se vocês têm mesa provençal e quanto custa.
A maior parte desiste ali. É o gasto de aquisição inteiro jogado fora na
primeira tela.

**O que o app promete não é o que a empresa faz.** O banner diz "A gente
entrega, monta e recolhe. Você só comemora." O resumo mostra "🚚 Entrega". O
formulário pede endereço de entrega. A decisão oficial é **retirada na sede**,
com entrega opcional mediante taxa. Se eu reservo achando que vai chegar na
minha casa e descubro depois que preciso buscar, a experiência já quebrou — e
com os Termos publicados dizendo outra coisa, vira problema jurídico, não só
de expectativa.

**Eu não conseguiria pagar.** `MP_ACCESS_TOKEN` está vazio, então o botão
"Pagar sinal via Pix" devolve erro. E ele só aparece *depois* de solicitar a
reserva, que por sua vez depende de a Maria Luiza confirmar manualmente. O
caminho real hoje é: montar tudo → pedir → esperar → voltar no app → tentar
pagar → não conseguir. O objetivo declarado ("reservar e pagar o sinal em três
minutos") não é alcançável em nenhuma circunstância.

Some-se a isso o catálogo sem fotos, e a resposta honesta é que hoje o app
não converte um desconhecido. Converte, no máximo, alguém que já ia comprar e
que a Maria Luiza mandou baixar.

---

## 3. Os 10 maiores problemas, por prioridade

| # | Problema | Por quê | Classe |
| --- | --- | --- | --- |
| 1 | Catálogo atrás do login | Mata a conversão na primeira tela e é risco de reprovação da Apple (5.1.1(v): não se pode exigir conta para função que não precisa de conta) | **P0** |
| 2 | App promete entrega, operação é retirada | Divergência com os Termos publicados; quebra de expectativa no pior momento | **P0** |
| 3 | Pagamento do sinal não funciona | É o momento da receita. Sem ele não existe MVP, existe catálogo | **P0** |
| 4 | Maria Luiza não consegue trabalhar a reserva | Sem telefone, sem lista de itens, sem WhatsApp no painel. Toda reserva vira garimpo manual | **P0** |
| 5 | Cliente não é avisado quando a reserva é confirmada | Ele precisa adivinhar e reabrir o app. Abandono depois de já ter pedido — o abandono mais caro que existe | **P1** |
| 6 | Fluxo de criação pede dados demais | Tipo, data, convidados, orçamento, endereço, bairro e tema numa tela só — mesmo quem já escolheu o kit e o tema no catálogo | **P1** |
| 7 | Catálogo sem fotos e sem informação que substitua a foto | Sem dimensão, cor, quantidade disponível ou "serve para quantas pessoas", o card vazio não vende | **P1** |
| 8 | Cancelamento existe no papel e não no produto | A política tem quatro faixas; o app não mostra prazo, não deixa cancelar, e a Maria Luiza calcula reembolso na mão | **P2** |
| 9 | Home não tem prova social nem urgência | Nenhum depoimento, nenhuma foto de festa real, nenhuma indicação de agenda apertada | **P2** |
| 10 | Zero testes automatizados no cálculo de dinheiro | Orçamento, split 50/50 e disponibilidade de data não têm rede de proteção. O bug do salvamento silencioso já mostrou o custo | **P2** |

---

## 4. Backlog priorizado

Escala de esforço: **P** = até meio dia · **M** = 1 a 2 dias · **G** = 3+ dias.

### P0 — sem isto não se lança

| Item | Conversão | Operação | Financeiro | Esforço | Tempo |
| --- | --- | --- | --- | --- | --- |
| Catálogo público (login só para reservar) | **Altíssimo** — remove a barreira da 1ª tela | — | Indireto, alto | M | 1 dia |
| Alinhar app ao modelo retirada/entrega | Alto — expectativa correta | Alto — evita entrega não combinada | Médio — taxa de entrega vira receita | P | ½ dia |
| Pix do sinal funcionando ponta a ponta | **Altíssimo** — é onde entra o dinheiro | Alto — acaba a cobrança manual | **Direto** | G | 2-3 dias |
| Painel operacional da reserva | — | **Altíssimo** — é o trabalho diário dela | Médio — menos erro, menos perda | M | 1-2 dias |

### P1 — entra se o prazo permitir

| Item | Conversão | Operação | Financeiro | Esforço | Tempo |
| --- | --- | --- | --- | --- | --- |
| Avisar o cliente na confirmação (WhatsApp em 1 clique) | Alto | Alto | Médio | P | ½ dia |
| Enxugar o fluxo de criação | Alto | — | Médio | M | 1 dia |
| Ficha do produto que vende sem foto | Médio-alto | Médio — menos pergunta no WhatsApp | Médio | M | 1 dia |
| Estados vazios e carregamento decentes | Médio | — | Baixo | P | ½ dia |

### P2 — depois dos primeiros clientes reais

Cancelamento no app com cálculo automático do reembolso · prova social na
home · testes de orçamento, split e disponibilidade · painel de conversão do
funil (os eventos já são gravados, falta ler) · busca com sinônimos.

### P3 — backlog declarado

Refresh token · recuperação de senha por e-mail · notificação push ·
IA de simulação de decoração · programa de indicação · área de parceiros ·
pagamento por cartão.

---

## 5. Onde o cliente desiste

```
Cadastro → Home → Tema → Kit → Extras → Resumo → Reserva → Pagamento
   ▲                                                  ▲         ▲
   └── maior perda                       espera manual ┘         └── impossível hoje
```

| Etapa | Por que desiste | Como reduzir |
| --- | --- | --- |
| **Cadastro** | É a primeira tela e cobra dados antes de entregar valor | Abrir o catálogo. Pedir conta só ao reservar, quando ele já quer |
| **Home** | Sem foto, sem prova de que a empresa existe | Foto de festa real, bairros atendidos, "X festas montadas" |
| **Tema** | Pede tema de novo para quem já escolheu no catálogo | Pular o passo quando já houver escolha |
| **Kit** | Não dá para comparar dois kits | Mostrar o que está dentro de cada um, lado a lado |
| **Extras** | Some do fluxo quem veio pelo catálogo | Sugerir 3 extras que combinam com o kit escolhido |
| **Resumo** | Sete campos pedidos de uma vez | Só data e convidados. Endereço só se pedir entrega |
| **Reserva** | "Aguarde a confirmação" sem prazo | Dizer *quando* responde ("até 2h em horário comercial") e mandar WhatsApp na hora |
| **Pagamento** | Não funciona | Pix imediato, com QR e copia-e-cola, no mesmo minuto da reserva |

A perda mais cara não é a primeira: é a da etapa Reserva. Alguém que montou a
festa inteira e pediu já demonstrou intenção de compra máxima. Deixá-lo
esperando sem retorno é queimar o cliente mais quente do funil.

---

## 6. A experiência transmite o quê?

| Atributo | Nota | Comentário |
| --- | --- | --- |
| Confiança | 4/10 | Marca bonita, mas nenhuma prova de que a empresa existe: sem foto real, sem endereço, sem depoimento, sem CNPJ visível |
| Praticidade | 6/10 | O catálogo é bom. O fluxo de criação atrapalha |
| Organização | 8/10 | Categorias, kits e favoritos bem resolvidos |
| Rapidez | 5/10 | Três minutos só para quem já sabe o que quer. O padrão é mais |
| Encantamento | 7/10 | Balões, confete e a palavra "Festaê!" no resumo funcionam muito bem |
| Desejo de fazer festa | 4/10 | Não por culpa do design — é a falta das fotos. Ninguém sonha com um card cinza |

A identidade visual é um ativo real e está acima da média do setor. O que
falta é **prova**, não beleza.

---

## 7. Catálogo sem fotos: o que dá para fazer agora

Sim, dá para melhorar bastante sem uma única foto:

- **Ficha técnica no card e no detalhe** — dimensões, cor, material, "serve
  para até N pessoas". Quem aluga decoração precisa saber se a mesa cabe na
  sala. Hoje essa pergunta vira mensagem no WhatsApp.
- **"Vai bem com"** — 3 itens que combinam. É venda cruzada e ajuda a montar.
- **Placeholder com identidade** — em vez de cinza, o ícone da categoria sobre
  um fundo da paleta da marca. Um catálogo sem foto pode parecer *em
  preparação*; hoje parece *quebrado*.
- **Ordenar por disponibilidade e por quantidade em estoque** — o que existe
  em maior número aparece primeiro; menos frustração de item indisponível.

Nada disso exige as fotos e tudo isso continua valendo depois que elas
chegarem.

---

## 8. Sobre imagens (resposta à Etapa 2 do briefing)

**A infraestrutura está adequada para o MVP. Não mexer.** R2 + URL pública +
cache imutável de um ano é a escolha certa e já está feita.

Duas melhorias pequenas valem o esforço, e só duas:

1. **Placeholder com identidade** enquanto não há foto (acima). Meia hora.
2. **Redimensionar no upload** — a Maria Luiza vai subir foto de celular de
   4 MB, e o app vai baixar 4 MB para mostrar num card de 150px. Reduzir para
   ~1200px e converter para WebP no momento do upload corta o tráfego em mais
   de 90%, acelera o app no 4G de Chapecó e economiza banda. Isso se faz
   **no painel, antes de enviar** — não é infraestrutura nova, é uma função
   de compressão no formulário que já existe.

**O que eu não faria agora:** lazy loading (as listas são curtas e o React
Native já recicla), skeleton elaborado, AVIF (suporte irregular, ganho
marginal sobre WebP), CDN adicional (o r2.dev já é CDN), carregamento
progressivo. Nada disso muda a conversão de um catálogo com dez itens.

---

## 9. Operação da Maria Luiza

O buraco está entre "cliente pediu" e "festa acontece". Hoje o painel de
Reservas mostra data, cliente, e-mail, tema/kit, total, status e notas. Falta
tudo o que ela precisa para agir:

| Retrabalho hoje | Solução |
| --- | --- |
| Não vê o telefone; procura o cliente em outro lugar | Telefone na linha + botão que abre o WhatsApp com mensagem pronta |
| Não vê os itens da reserva; abre o pedido item a item | Lista de separação expandindo a linha, pronta para conferir e imprimir |
| Confirma e o cliente não sabe | Ao confirmar, abrir o WhatsApp com a confirmação escrita — automação de verdade viria depois |
| Não sabe quem pagou o sinal | Coluna de pagamento na reserva, alimentada pelo webhook do Mercado Pago |
| Calcula reembolso de cancelamento na mão | Sistema calcula a faixa pela data e mostra o valor |
| Não sabe o que sai amanhã | Visão "retiradas de hoje / de amanhã" |

O padrão que eu recomendo — e defendo — é **automatizar o cálculo e a
memória, não a comunicação**. Numa operação de festa em cidade do interior, a
conversa por WhatsApp com a dona é parte do valor percebido; trocá-la por
e-mail automático seria perder diferencial. O sistema deve preparar a
mensagem e deixar o envio a um toque.

---

## 10. O que eu removeria do MVP

- **"Orçamento desejado"** no formulário. Não é usado em lugar nenhum e é
  mais um campo entre o cliente e a reserva.
- **Passo de tema quando já veio do catálogo.** Perguntar duas vezes a mesma
  coisa é o tipo de detalhe que faz o app parecer burro.
- **Aba Favoritos como aba.** Ocupa um quinto da barra inferior para uma
  função secundária. Vira um coração no cabeçalho da home; a aba dá lugar a
  algo que gera receita.
- **Menção a parceiros** em qualquer lugar visível, até existirem.
- **Banner de promoção rotativo com três mensagens.** Uma mensagem clara
  converte mais que três genéricas.

Nada disso é jogar trabalho fora — é tirar do caminho do cliente.

---

## 11. Se eu tivesse só mais uma Sprint

Faria exatamente os quatro P0, nesta ordem: **catálogo aberto → modelo de
retirada correto → Pix do sinal → painel operacional.**

O raciocínio: os dois primeiros são baratos e destravam o topo do funil; o
terceiro é o único que transforma uso em dinheiro; o quarto é o que impede a
operação de quebrar quando o terceiro funcionar. Adicionar qualquer outra
coisa nesta Sprint atrasa o dia em que a primeira venda acontece — e a
primeira venda real vai ensinar mais sobre o produto do que qualquer
funcionalidade que eu escreva antes dela.

---

## 12. Proposta da Sprint 3 — "Da vitrine ao Pix"

**Objetivo único:** uma pessoa que nunca ouviu falar da Festaê baixa o app,
vê o catálogo, monta a festa, reserva e paga o sinal — e a Maria Luiza
consegue atender essa reserva sem sair do painel.

**Critério de aceite:** eu consigo, com um celular e uma chave Pix real, ir da
instalação até o comprovante de pagamento em menos de cinco minutos, sem
ajuda; e a Maria Luiza consegue, só pelo painel, saber quem comprou, o que
separar, quando entregar e se já pagou.

### Escopo fechado

1. **Catálogo aberto.** Home, categorias, busca e detalhes sem login. Login
   exigido só ao reservar. O orçamento montado antes do login sobrevive ao
   cadastro. *(Conversão + exigência da Apple.)*
2. **Modelo de retirada.** "Retirada na Festaê" como padrão em todo o app;
   entrega vira opção explícita com taxa informada; textos alinhados aos
   Termos. Endereço só é pedido a quem escolhe entrega. *(Confiança + legal.)*
3. **Pix do sinal.** Mercado Pago ligado, QR e copia-e-cola dentro do app,
   webhook confirmando o pagamento, status refletido para o cliente e para o
   painel. *(Receita.)*
4. **Painel operacional da reserva.** Telefone, lista de separação, botão de
   WhatsApp com mensagem pronta, status de pagamento, e a visão de retiradas
   do dia. *(Operação.)*
5. **Fluxo enxuto.** Remoção de "orçamento desejado", do tema duplicado e do
   endereço obrigatório. *(Conversão.)*

### Fora do escopo, e por quê

Notificação push (precisa de conta de desenvolvedor ativa — depois do
D-U-N-S), cancelamento no app (pouca demanda antes do primeiro cliente),
prova social (depende das fotos), IA de decoração (não é MVP), refresh token
(risco residual pequeno depois da invalidação por troca de senha).

### Riscos

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| Homologação do Mercado Pago demora | Média | Alto — trava o item 3 | Começar a credencial no primeiro dia da Sprint, em paralelo ao resto |
| Catálogo aberto sem fotos decepciona mais gente | Média | Médio | Placeholder com identidade + ficha técnica ajudam; e é preferível decepcionar antes do cadastro que depois |
| D-U-N-S atrasa e as contas de loja não abrem | Média | Alto — trava o lançamento inteiro | Sprint 3 não depende disso; o app pode ser testado por TestFlight/APK interno |
| Fotos atrasam | Alta | Alto | Tratar a sessão de fotos como item de projeto com data marcada, não como "quando der" |
| Primeira venda com bug de cálculo | Baixa | Alto | Testes de orçamento e split antes de abrir para clientes reais |

### Oportunidades

- **Taxa de entrega é receita nova** que hoje não existe no sistema. Ao
  modelar entrega como opção paga, ela passa a ser cobrada e medida.
- **Os eventos de funil já estão sendo gravados** desde a Sprint 1 e ninguém
  lê. Uma tela simples de conversão no painel responderia "onde as pessoas
  desistem" com dados reais em vez de opinião — inclusive a minha.
- **Pix tem custo perto de zero** frente a cartão. Lançar só com Pix não é
  limitação, é margem.
- **Retirada na sede cria contato presencial** — é a melhor chance de venda
  adicional e de pedir uma avaliação na loja.

---

## 13. Recomendação final

Aprovar a Sprint 3 exatamente como descrita e **não acrescentar nada**. O
maior risco do projeto neste momento não é técnico: é continuar melhorando um
produto que ninguém usou ainda. Cada semana de polimento antes da primeira
venda real é uma semana de decisão baseada em achismo — o meu inclusive.

Três recomendações que sustento:

1. **Marcar a data da sessão de fotos antes de começar a Sprint 3.** É a
   dependência com maior impacto na conversão e a única que não depende de
   código. Sem data marcada, ela escorrega indefinidamente.
2. **Não esperar as lojas para ter cliente real.** O D-U-N-S e a revisão da
   Apple podem levar semanas. Um APK direto e o TestFlight permitem que as
   primeiras dez festas aconteçam pelo app antes disso — e essas dez festas
   valem mais que qualquer Sprint.
3. **Depois da Sprint 3, a Sprint 4 deve ser decidida com os dados do funil,
   não com a nossa intuição.** Já temos a instrumentação; falta usá-la.
