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
entregues no mundo real** (aluguel de material de festa com entrega e
montagem). Por isso o app usa Mercado Pago e não o in-app purchase da Apple —
essa é exatamente a exceção prevista na regra 3.1.3(e) das App Store Review
Guidelines. Se isso não estiver claro para o revisor, a rejeição por "uso de
sistema de pagamento externo" é comum.
