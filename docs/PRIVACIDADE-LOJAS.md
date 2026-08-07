# Formulários de privacidade das lojas

Apple e Google perguntam, campo a campo, quais dados o app coleta. As duas
comparam a resposta com o comportamento real do app na revisão — declarar a
menos é reprovação quase certa, e declarar a mais assusta o cliente à toa.

Este documento é a resposta pronta, tirada do que o código realmente faz.
Se algum dia o app passar a coletar outra coisa, atualize aqui antes de
mexer no console.

**URLs que os dois formulários pedem:**

- Política de Privacidade: `https://festa-production.up.railway.app/legal/privacidade`
- Termos de Uso: `https://festa-production.up.railway.app/legal/termos`

**Dados cadastrais que as duas lojas conferem** (têm que bater com o titular
da conta de desenvolvedor, senão a conta trava na verificação):

| Campo | Valor |
| --- | --- |
| Razão social | 68.155.380 MARIA LUIZA POCAI |
| Nome fantasia / nome do app | Festaê |
| CNPJ | 68.155.380/0001-77 |
| Endereço | Rua Coronel Manoel dos Passos Maia, 68, Apto 505, Jardim Itália, Chapecó/SC, CEP 89802-080 |
| D-U-N-S | 583908127 |
| E-mail de contato | contato@festaechapeco.com.br |

> O endereço acima é residencial e **fica público** — aparece na política de
> privacidade, que é exigida em URL aberta, e a Apple exibe o endereço do
> desenvolvedor na ficha da App Store. É o preço de publicar como empresa
> individual e é assim para todo MEI. Se isso incomodar, a saída é um
> endereço comercial no cartão CNPJ — decisão de negócio, não de código.

---

## O que o app coleta hoje

| Dado | Onde é coletado | Para quê | Obrigatório? |
| --- | --- | --- | --- |
| Nome | Cadastro | Identificar o cliente no pedido e na entrega | Sim |
| E-mail | Cadastro | Login e contato | Sim |
| Telefone | Cadastro | Combinar entrega pelo WhatsApp | Não |
| Data da festa, nº de convidados, orçamento desejado, tema | Montagem da festa | Montar o orçamento e reservar a data | Sim, para contratar |
| Endereço e bairro | Montagem da festa, só quando pede entrega | Entregar e montar no local | Só com entrega |
| Ações no app (cadastro, login, tema escolhido, kit escolhido, item adicionado, clique no WhatsApp, reserva, pagamento) | Uso do app | Entender onde o cliente desiste e melhorar o fluxo | — |
| Dados de pagamento | Checkout | Cobrar | Ficam **no Mercado Pago**, não na Festaê |

**O que o app NÃO coleta:** localização do aparelho, contatos, fotos da
galeria, agenda, microfone, câmera, identificadores de publicidade, histórico
de navegação fora do app. Nada é vendido, e não há rede de anúncios embutida.

> **Fotos e a IA de decoração.** A política já traz a cláusula que rege o
> envio de fotos para a simulação por inteligência artificial, publicada
> antes do recurso existir para não obrigar a recolher o aceite de todo mundo
> de novo no dia do lançamento. Enquanto o recurso não existir no app,
> **"Photos" e "Photos and videos" ficam DESMARCADOS** nos dois formulários:
> declarar coleta que não acontece é tão errado quanto omitir a que acontece,
> e a Apple testa o app para conferir. No dia em que a IA entrar, marque
> Apple → *User Content → Photos or Videos* (Purpose: App Functionality,
> Linked: Yes, Tracking: No) e Google → *Photos and videos → Photos*
> (opcional, finalidade App functionality) **antes** de publicar a versão.

---

## Apple — App Privacy (App Store Connect)

Em *App Store Connect → seu app → App Privacy*, responda:

**"Does this app collect data?"** → **Yes**

Marque estas categorias e, em cada uma, o uso e a ligação com a identidade:

| Categoria da Apple | Marcar | Purpose | Linked to user | Used for tracking |
| --- | --- | --- | --- | --- |
| Contact Info → Name | Sim | App Functionality | Yes | **No** |
| Contact Info → Email Address | Sim | App Functionality | Yes | **No** |
| Contact Info → Phone Number | Sim | App Functionality | Yes | **No** |
| Contact Info → Physical Address | Sim | App Functionality | Yes | **No** |
| Purchases → Purchase History | Sim | App Functionality | Yes | **No** |
| Usage Data → Product Interaction | Sim | Analytics, App Functionality | Yes | **No** |
| Identifiers → User ID | Sim | App Functionality | Yes | **No** |

Tudo o mais fica desmarcado. Em especial **não marque** Location, Contacts,
Photos, Browsing History, Search History, Sensitive Info, Health, Financial
Info (o cartão é digitado dentro do Mercado Pago, não no app) nem
Advertising Data.

**"Used for tracking"** é **No** em todas: o app não cruza dados com outras
empresas nem com corretoras de dados. Marcar "Yes" aqui obrigaria a pedir
permissão de rastreamento (ATT) na primeira abertura, o que não é o caso.

Outros campos da ficha que a Apple exige e já estão prontos:

- **Privacy Policy URL** — a de cima.
- **Account deletion** — a Apple exige que dê para excluir a conta dentro do
  app desde 2022. Está em Perfil → Minha Conta → *Solicitar exclusão da
  conta*. Aponte esse caminho na nota de revisão.
- **Sign in with Apple** — só é obrigatório se o app oferecer login social de
  terceiros (Google, Facebook). A Festaê usa e-mail e senha, então **não é
  exigido**. Se um dia entrar login com Google, entra Sign in with Apple junto.

---

## Google — Data safety (Play Console)

Em *Play Console → seu app → Política → Segurança dos dados*:

**"Does your app collect or share any of the required user data types?"** → **Yes**
**"Is all of the user data collected by your app encrypted in transit?"** → **Yes** (HTTPS obrigatório)
**"Do you provide a way for users to request that their data be deleted?"** → **Yes**, e informe a URL da política

| Tipo de dado (Google) | Coletado | Compartilhado | Obrigatório | Finalidade |
| --- | --- | --- | --- | --- |
| Personal info → Name | Sim | Não | Sim | App functionality, Account management |
| Personal info → Email address | Sim | Não | Sim | App functionality, Account management |
| Personal info → Phone number | Sim | Não | Não | App functionality |
| Personal info → Address | Sim | Não | Não | App functionality |
| Financial info → Purchase history | Sim | Não | Sim | App functionality |
| App activity → App interactions | Sim | Não | Não | Analytics, App functionality |

**Não marque** Location, Contacts, Photos and videos, Files and docs, Calendar,
Messages, Health and fitness, Web browsing, nem Financial info → Payment info
(o cartão vai direto para o Mercado Pago).

**Compartilhamento:** o Google diferencia *coletar* de *compartilhar*. Os
dados vão para prestadores de serviço (hospedagem Railway, armazenamento
Cloudflare, pagamento Mercado Pago) — pela definição do Google isso **não
conta como compartilhamento**, porque são operadores processando em nome da
Festaê, não terceiros usando os dados para fins próprios. Marque "Não
compartilhado".

**Exclusão de conta:** o Google exige, além do caminho dentro do app, uma
forma de pedir exclusão **de fora** dele — para quem desinstalou. Está
coberto: o e-mail `contato@festaechapeco.com.br` aparece na política de
privacidade e na tela Minha Conta. Informe esse e-mail no campo
"URL de solicitação de exclusão de conta" (aceita URL da política).

---

## Classificação etária

Nas duas lojas o app é **livre / 3+ / Everyone**: não tem conteúdo adulto,
violência, chat entre usuários, compras dentro do app (o pagamento é de um
serviço contratado, fora da regra de in-app purchase) nem conteúdo gerado
por usuário.

Vale registrar na revisão que os pagamentos são de **bens e serviços físicos
entregues no mundo real** (aluguel de material de festa, retirado na sede ou
entregue no local do evento). Por isso o app usa Mercado Pago e não o in-app
purchase da Apple — essa é exatamente a exceção prevista na regra 3.1.3(e)
das App Store Review Guidelines. Se isso não estiver claro para o revisor, a
rejeição por "uso de sistema de pagamento externo" é comum.

---

## Nota de revisão sugerida (App Review / Play Console)

Cole isto no campo de notas para o revisor, junto com uma conta de teste:

> A Festaê aluga artigos para festas em Chapecó/SC. O cliente monta o
> orçamento, reserva a data e paga 50% de sinal via Pix; os itens são
> retirados na sede da empresa ou entregues no local mediante taxa. Todos os
> pagamentos correspondem a bens e serviços físicos consumidos fora do
> aplicativo (App Store Review Guidelines 3.1.3(e)).
>
> Exclusão de conta dentro do app: Perfil → Minha Conta → Solicitar exclusão
> da conta. Exportação de dados no mesmo lugar. Política de Privacidade e
> Termos de Uso acessíveis sem login, na tela de cadastro e em Minha Conta.

---

## Manutenção deste documento

Este arquivo, a Política de Privacidade e os Termos de Uso descrevem o mesmo
produto e precisam ser alterados juntos. Antes de publicar qualquer versão
nova nas lojas, confira que os quatro estão dizendo a mesma coisa:

| Assunto | Onde está | Valor atual |
| --- | --- | --- |
| Pagamento | Termos §Preços e pagamento | 50% na reserva + 50% na retirada, Pix |
| Cancelamento | Termos §Cancelamento e reembolso | 100% / 75% / 50% / 0% por faixa |
| Entrega | Termos §Retirada, entrega e devolução | Retirada na sede; entrega opcional com taxa |
| Danos | Termos §Responsabilidade pelos itens alugados | Cliente responde da retirada à devolução |
| Fotos/IA | Política §Fotos que você envia | Cláusula publicada, recurso ainda não existe |
| Dados coletados | Política §Quais dados coletamos | Espelhado na tabela deste documento |

Alterou o texto? Suba `TERMS_VERSION` em `packages/shared/src/legal.ts`.
