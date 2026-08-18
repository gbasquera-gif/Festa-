# Festaê SaaS — visão estratégica registrada

> **Status: registrado, não iniciado.** Nada neste documento está em construção.
> A prioridade continua sendo a Festaê Chapecó. Este arquivo existe para que a
> evolução continue possível — e para que ninguém tome, sem perceber, uma
> decisão que a inviabilize.
>
> O gatilho para sair do papel é a frase **"Vamos iniciar o Festaê SaaS"**.
> Antes de qualquer código, virá uma análise completa da arquitetura atual e
> uma proposta de transformação para multi-tenant.

---

## 1. A oportunidade

Hoje a Festaê é software de uma empresa só: a nossa. A hipótese é que a mesma
tecnologia sirva a outras empresas do setor — pegue e monte, decoração de
festas, locação de artigos, decoração infantil, pequenos espaços de eventos.

O produto não seria "um site". Seria a gestão da empresa inteira, do primeiro
clique do cliente até o lucro líquido do mês:

```
Instagram / Google / indicação → catálogo → tema → kit → adicionais →
orçamento → reserva → sinal → agenda → operação → entrega/montagem →
devolução → financeiro → indicadores → decisão
```

**Posicionamento:** Vertical SaaS B2B para empresas de decoração e locação de
artigos para festas.

**Promessa:** *"Da reserva ao lucro líquido."*

**Categoria de concorrência:** não é contra Wix ou Shopify (que vendem loja),
nem contra Conta Azul ou Bling (que vendem contabilidade). É contra a planilha
+ o caderno + o WhatsApp que essas empresas usam hoje.

---

## 2. O que ainda não está decidido

Estes pontos estão registrados como **hipótese**, não como plano:

| Tema | Hipótese atual | Decisão pendente |
|---|---|---|
| Preço | Starter R$ 99 / Pro R$ 199 / Premium R$ 399 por mês | O que separa os planos |
| Taxa por transação | Talvez mensalidade + taxa | Ver §7 — há um argumento contra |
| Domínio | `cliente.festae.com.br`, depois domínio próprio | Como identificar o tenant |
| Pagamento | Cada empresa com sua conta Mercado Pago | OAuth do MP, não guardar chave (§6.5) |
| App nativo | Continua como camada complementar | Ver §7 — não prometer app por cliente |

---

## 3. Roadmap por fases

Ordem revisada em relação à proposta original (o porquê está em §7).

| Fase | O quê | Pré-requisito real |
|---|---|---|
| 1 | Validar a Festaê própria | Vendas, reservas, pagamentos e operação rodando de verdade |
| 2 | Primeiros clientes reais | Fase 1 provada com números, não com sensação |
| 3 | **Descobrir o que é realmente usado** | Analytics do painel, não só do funil de venda |
| 4 | Multi-tenant + onboarding de empresa | Fases 3 concluída — são o mesmo trabalho |
| 5 | Loja personalizada por empresa | Multi-tenant |
| 6 | Cobrança e planos SaaS | Loja pronta — é ela que a empresa compra |
| 7 | Estoque por item | *Ver §7: candidato a subir para a Fase 1* |
| 8 | Gestão financeira | Escopo enxuto, ver §7 |
| 9 | Business Intelligence | Dados confiáveis das fases anteriores |
| 10 | IA para recomendação e gestão | Tudo acima |

**A Fase 3 é a mais importante e a mais fácil de pular.** É ela que decide o
que entra no produto e o que morre. Sem ela, o roadmap vira uma lista de
desejos de cinco clientes diferentes.

---

## 4. O que preservar na arquitetura

Estas escolhas já foram feitas e **facilitam** a evolução. Vale saber que são
ativos, para não desfazê-las por engano:

- **Motor de preços puro e testável** (`packages/shared/src/pricing.ts`).
  `calculateOrderPricing` recebe tudo por parâmetro e não conhece banco. Trocar
  as constantes por configuração de cada empresa é mecânico, não é reescrita.
- **Um só caminho para o dinheiro.** App e API usam a mesma função. Sem isso,
  cada tenant multiplicaria os lugares onde o preço pode divergir.
- **Schemas Zod compartilhados** (`packages/shared`): um lugar só para
  acrescentar o tenant na validação.
- **Armazenamento abstraído** (`StorageService`): trocar o caminho das imagens
  para incluir a empresa é uma linha.
- **Monorepo com apps separados**: a loja web de cada cliente nasce como app
  próprio, sem desmontar nada.
- **Filtro de erro do Prisma** (`prisma-exception.filter.ts`): erro de banco já
  vira resposta legível — inclusive os que multi-tenancy vai criar.

---

## 5. Regras de higiene para os próximos sprints

Custam zero hoje e evitam retrabalho caro depois. **Não são tarefas — são
coisas a não fazer:**

1. **Não espalhar regra de negócio pelo código.** Taxa, sinal, cidade e
   capacidade continuam passando por `packages/shared`. Cada novo lugar que
   ler `DELIVERY_FEE` direto é um lugar a mais para consertar depois.
2. **Não criar novo campo `@unique` global** em tabela de catálogo. Hoje isso
   já é um problema conhecido (§6.1); não vamos aumentá-lo.
3. **Não gravar dado de operação sem dono claro.** Toda tabela nova deveria
   responder "de quem é esta linha?" — hoje a resposta é "da Festaê", e está
   certo. Só não vale criar tabela onde a pergunta não faça sentido.
4. **Não prometer nada de SaaS para cliente da Festaê Chapecó.**

---

## 6. Auditoria: o que hoje bloqueia multi-tenancy

Levantamento real do código em agosto/2026. **Nenhum destes pontos é para
consertar agora** — a lista existe para dimensionar o trabalho e evitar
surpresa.

### 6.1 `slug` único global — *barato de corrigir, alto risco de esquecer*
`Theme.slug`, `Product.slug` e `Kit.slug` são `@unique` no banco inteiro. Com
duas empresas, o "kit-essencial" da primeira impediria a segunda de ter o dela.
Correção: `@@unique([tenantId, slug])` — uma migration. O desempate de slug já
está isolado em `apps/backend/src/common/slug.ts`, então passa a receber o
tenant sem espalhar mudança.

### 6.2 `User.email` único global — *o mais caro da lista*
Uma pessoa que aluga da Empresa A e da Empresa B não conseguiria se cadastrar
na segunda. Mexe em login, token, recuperação de senha e exclusão de conta.
**Decisão de arquitetura a tomar antes de escrever código:** conta por empresa
(`@@unique([tenantId, email])`) ou conta única com vínculo N:N a várias
empresas. As duas têm consequência de produto, não só técnica.

### 6.3 Regras de negócio como constante de código — *médio, mecânico*
`DELIVERY_FEE = 20`, `ASSEMBLY_FEE = 50`, `DEPOSIT_RATE = 0.5`,
`DELIVERY_CITY = "Chapecó"` e a capacidade diária (variável de ambiente) são
fixas. Toda empresa terá as suas. Estão concentradas em um arquivo, o que torna
a migração para configuração por tenant previsível.

### 6.4 Documentos legais com os dados da Festaê — *jurídico, não técnico*
Termos e Política têm razão social, CNPJ e regras da Festaê embutidos em
`packages/shared/src/legal.ts`. Num SaaS, **quem contrata com o cliente final é
a empresa locadora, não a Festaê** — e passa a existir um segundo contrato, o
nosso com ela. Muda a natureza dos documentos, não só o texto. Exige advogado.

### 6.5 Credenciais de pagamento em variável de ambiente única — *sensível*
Hoje há uma conta Mercado Pago para a plataforma inteira. Por tenant, o caminho
correto é **OAuth do Mercado Pago**, em que cada empresa autoriza a plataforma
sem nos entregar a chave. Pedir e guardar credencial de terceiro cria uma
responsabilidade de segurança que hoje não temos e que não compensa assumir.

### 6.6 Marca fixa no app mobile — *limita o formato do produto*
Cores, logo e número de WhatsApp estão no código do app. Loja web white-label
resolve. App nativo por empresa significaria uma submissão por cliente na Apple
e no Google, com revisão, conta de desenvolvedor e atualização de cada uma.
**Ver §7.**

### 6.7 Imagens sem separação por empresa — *barato*
As pastas são `themes/`, `kits/`, `products/`. Prefixar com a empresa é trivial
— só precisa ser decidido antes de haver volume de arquivo para migrar.

### 6.8 Capacidade da agenda é um número por dia, não por item — *já é dívida hoje*
Ver §7. Este é o único item da auditoria que existe **antes** do SaaS.

---

## 7. Análise crítica (CTO/PO)

Registro aqui o que discordo ou ajustaria. A visão está sólida; estes são os
pontos onde ela pode se machucar.

### 7.1 O risco maior não é técnico
Multi-tenancy é trabalho conhecido e estimável. O que mata SaaS vertical é
outra coisa: vender para cinco empresas e descobrir que cada uma quer um
produto diferente. Sem a Fase 3 levada a sério, o roadmap vira fila de pedidos.

**Consequência prática:** o painel precisa medir o que é usado, do mesmo jeito
que o app já mede o funil de venda. Sem isso, a Fase 3 é chute.

### 7.2 "Da reserva ao lucro líquido" é uma promessa grande demais para o escopo listado
Contas a pagar, pró-labore, aporte de sócio e fluxo de caixa são software de
contabilidade. Nesse terreno concorremos com Conta Azul, Bling e Granatum —
que fazem isso há anos, com contador junto, e por preço parecido.

**Recomendação:** não construir contabilidade. Construir o que o ERP genérico
não faz, porque não conhece o negócio:

- custo por festa (produto + entrega + montagem + mão de obra);
- margem por kit e por tema;
- rentabilidade por produto (quanto aquele painel já pagou de si mesmo);
- capital parado em item que não roda.

Despesa e conta a pagar entram no nível mais simples que resolva — ou por
exportação para o contador. **O diferencial é a margem por festa, não o livro
caixa.** Essa é a diferença entre "mais um financeiro" e "o único sistema que
sabe quanto sobra de uma festa de Safari".

### 7.3 Estoque provavelmente vale mais que financeiro — e é dívida nossa hoje
Numa locadora, o problema operacional número um é dois eventos no mesmo sábado
disputando o mesmo painel. Hoje a agenda tem **capacidade por dia**, não por
item: o sistema aceita reservar o mesmo arco duas vezes no mesmo dia e ninguém
descobre até a hora de carregar o carro.

Isso é um risco da Festaê Chapecó **agora**, independente de SaaS. É o único
item deste documento que eu tiraria do fim da fila.

**Recomendação:** avaliar disponibilidade por item ainda na Fase 1, no formato
mais simples que funcione (quantidade total menos reservada na data). Estoque
completo — perda, dano, manutenção, reposição — continua no futuro.

### 7.4 A ordem das fases 5, 6 e 7
A loja personalizada é **o que a empresa compra**. Cobrança sem loja é cobrar
por promessa. Trocar a ordem (loja antes de cobrança) reduz o risco de
construir faturamento para um produto que ninguém quis assinar.

Multi-tenant e onboarding também não são duas fases: quem faz o isolamento faz
o cadastro da empresa junto, senão não tem como testar.

### 7.5 App nativo por cliente: recomendo não prometer
Uma empresa de decoração em Chapecó não tem público para justificar app na
loja — e cada app é uma submissão, uma revisão e uma atualização por cliente.
A web já resolve: link do Instagram abre a loja, sem instalar nada. O app
nativo faz sentido para a Festaê, que é nossa. Como item de plano, viraria
custo recorrente sem receita proporcional.

### 7.6 Taxa sobre transação: eu não misturaria
Mercado que vive de Pix sente taxa. Mensalidade é previsível para os dois lados
e não cria a conversa "por que você fica com parte da minha festa?". Se um dia
houver split de pagamento, que seja serviço opcional, não regra do plano.

### 7.7 Sobre a faixa de preço
R$ 99–399/mês é razoável para começar, mas provavelmente **baixo** se o produto
entregar loja + agenda + estoque + margem por festa. O erro comum é ancorar
barato cedo e não conseguir subir depois. Sugiro tratar os números como teste,
não como tabela — e medir quanto a empresa fatura por mês antes de fixar.

### 7.8 O que está certo no documento
- IA no fim da fila, depois de dados confiáveis. Concordo integralmente.
- Não transformar em multi-tenant agora. Concordo — o isolamento feito antes de
  saber o que o produto é fica errado e custa duas vezes.
- Validar a Festaê primeiro. É a única fonte honesta de requisito que temos.

---

## 8. O que fazer quando chegar a hora

Na frase "Vamos iniciar o Festaê SaaS", a primeira entrega **não é código**:

1. Releitura desta auditoria contra o código daquele momento.
2. Decisão explícita sobre §6.2 (identidade do cliente entre empresas).
3. Escolha da estratégia de isolamento: coluna `tenantId` + índice composto,
   schema por tenant, ou RLS do Postgres. Cada uma tem custo operacional
   diferente em migration, backup e restauração de um cliente só.
4. Decisão sobre §6.4 com apoio jurídico.
5. Só então, proposta de implementação por etapas.
