# Checklist de lançamento

O que falta para o app ir para as lojas. Cada item diz quem faz: **você**
(painéis externos, contas, credenciais) ou **código** (a fazer no repositório).

---

## 0. Fechar o acesso ao painel — CONCLUÍDO

`JWT_SECRET` rotacionado, administrador vindo de `SEED_ADMIN_*`, e as contas
antigas do seed rebaixadas a cliente. Resta um único ADMIN, no e-mail oficial
da empresa. O histórico abaixo fica registrado porque explica decisões que
seguem valendo.

---

<details>
<summary>Como era e o que foi feito</summary>

O repositório é **público** e, até o commit que corrigiu isso, o seed criava
dois administradores com senha fixa escrita no código (`festae-admin-123`),
rodando a cada boot do container. Qualquer pessoa que lesse o repositório
podia entrar no painel de produção e ver nome, telefone, endereço e pedidos
de todos os clientes.

O código já não cria mais essas contas, **mas elas continuam no banco de
produção** — o seed nunca apaga nada. Fechar o buraco depende destes passos:

1. **Variáveis no Railway**, no serviço do backend:

   | Variável | Valor |
   |---|---|
   | `JWT_SECRET` | valor aleatório novo — gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `SEED_ADMIN_EMAIL` | `contato@festaechapeco.com.br` |
   | `SEED_ADMIN_PASSWORD` | uma senha forte e nova |
   | `SEED_ADMIN_NAME` | `Guilherme` |
   | `SEED_DEMO_DATA` | não defina (fica desligado) |

   Trocar `JWT_SECRET` invalida todas as sessões abertas, inclusive a de quem
   tenha entrado indevidamente. A API não sobe sem ele.

2. **Aposente as contas antigas.** Entre no painel com o administrador novo e
   use *Clientes → Nova senha* em `guilherme@festae.com.br` e
   `mariluiza@festae.com.br`, definindo senhas novas. Enquanto isso não for
   feito, a senha publicada continua valendo nelas.

3. **Considere tornar o repositório privado** em Settings → General → Danger
   Zone. Não é obrigatório, mas some com a classe inteira de problema.

> Uma senha que já esteve num repositório público deve ser tratada como
> conhecida para sempre. Não a reaproveite em nenhum outro serviço.

</details>

> **Recuperação de acesso:** com um único administrador, perder essa conta
> deixaria o painel sem ninguém. A saída é trocar `SEED_ADMIN_PASSWORD` no
> Railway e reimplantar — o seed reaplica a senha no próximo boot.

---

## 1. Bucket das imagens — CONCLUÍDO

Bucket `festae-catalogo` no Cloudflare R2, com URL pública ativa e credencial de
escrita restrita a esse bucket. Verificado ponta a ponta: upload pelo painel
grava no bucket e a imagem abre por link público, sem sessão.

O passo a passo abaixo fica registrado para o caso de precisar refazer.

<details>
<summary>Como foi configurado</summary>

1. **Criar o bucket.** [dash.cloudflare.com](https://dash.cloudflare.com) → **R2**
   → *Create bucket* → nome `festae-catalogo`, localização automática.
2. **Deixar as imagens públicas.** No bucket → *Settings* → *Public access*.
   Habilite o subdomínio `r2.dev` ou conecte um domínio próprio
   (ex.: `cdn.festaechapeco.com.br`). **Copie essa URL pública.**
3. **Criar a credencial.** R2 → *Manage API tokens* → *Create API token* →
   permissão **Object Read & Write**, com escopo apenas neste bucket.
   Copie o **Access Key ID** e o **Secret Access Key** — o secret só aparece
   uma vez.
4. **Pegar o Account ID**, que aparece na página do R2. O endpoint é
   `https://<account_id>.r2.cloudflarestorage.com`.
5. **Configurar no Railway.** Serviço do backend → *Variables*:

   | Variável | Valor |
   |---|---|
   | `S3_BUCKET` | `festae-catalogo` |
   | `S3_ACCESS_KEY_ID` | Access Key ID do passo 3 |
   | `S3_SECRET_ACCESS_KEY` | Secret Access Key do passo 3 |
   | `S3_PUBLIC_URL` | URL pública do passo 2 |
   | `S3_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |

6. **Conferir.** O serviço reinicia sozinho. No log do Railway deve aparecer
   `Uploads no bucket "festae-catalogo"`. Se aparecer o aviso
   `Uploads indo para o disco local`, alguma das quatro primeiras variáveis
   ficou faltando.

> Para testar de ponta a ponta antes de o admin estar publicado, rode o admin
> local com `VITE_API_URL` apontando para a API de produção e suba uma foto.

</details>

> A URL pública usa o subdomínio `r2.dev`, que a Cloudflare limita em banda e
> não recomenda para tráfego alto. Quando o app tiver movimento, aponte um
> `cdn.festaechapeco.com.br` para o bucket — exige trazer o DNS do domínio
> para a Cloudflare.

---

## 2. Contas das lojas — você · faz agora

As duas contas são de **organização**, no CNPJ da Festaê. Este é o único item
que não acelera com trabalho: são prazos de calendário. Comece por aqui.

### 2.1 D-U-N-S (bloqueia as duas lojas)

É o identificador da empresa exigido tanto pela Apple quanto pelo Google, e
**o mesmo número serve para as duas** — pede-se uma vez só.

**Situação: emitido**, atrelado ao CNPJ matriz. Guarde o número num lugar
privado (não neste repositório, que é público).

Duas condições antes de abrir as contas:

1. **Aguarde até 7 dias úteis** a partir da emissão. É o tempo de sincronizar
   a base da Dun & Bradstreet com a da Apple e a do Google. Tentar cadastrar
   antes disso dá erro de empresa não encontrada.
2. **Se a natureza jurídica for "Empresário Individual"**, o D-U-N-S não é
   aceito automaticamente: depois dos 7 dias é preciso ligar para o suporte
   da Apple (https://developer.apple.com/contact/phone/) e pedir a liberação
   manual. Confira a natureza jurídica no cartão CNPJ da Receita Federal.

A Apple só reconhece a matriz — nunca use CNPJ de filial no cadastro.

1. Consulte se a empresa já tem um, pelo
   [buscador da Apple](https://developer.apple.com/enroll/duns-lookup/).
   Muita empresa já possui sem saber.
2. Se não houver, solicite ali mesmo. É gratuito por esse caminho.
3. Preencha **razão social, endereço e telefone exatamente como constam no
   CNPJ**. Divergência de pontuação, abreviação ou endereço é a causa número
   um de atraso — o pedido volta para correção e o prazo reinicia.
4. Prazo típico de alguns dias úteis, mas pode passar disso.

### 2.2 Domínio e e-mail corporativo — CONCLUÍDO

`festaechapeco.com.br` registrado e `contato@festaechapeco.com.br` em uso —
é também a conta de administrador do painel.

Use esse endereço nos cadastros das duas lojas: elas verificam a empresa por
site e e-mail no domínio próprio, e a política de privacidade (item 5) precisa
ficar numa URL desse domínio.

### 2.3 Google Play Console — US$ 25, pagamento único

Cadastro em [play.google.com/console/signup](https://play.google.com/console/signup),
escolhendo **Organização**. Vai pedir D-U-N-S, razão social, endereço,
verificação de identidade de quem cadastra e um perfil de pagamentos.

Conta de organização não está sujeita à exigência de teste fechado prévio que
recai sobre contas pessoais novas — confirme a regra vigente no próprio
console, porque o Google mudou isso mais de uma vez.

### 2.4 Apple Developer Program — US$ 99/ano

Cadastro em [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll),
tipo **Organization**. Além do D-U-N-S, exige que quem faz o cadastro tenha
poderes para assinar em nome da empresa. A Apple costuma ligar para confirmar.

> Os dados da empresa precisam bater **entre si** em D-U-N-S, Receita Federal,
> Google e Apple. Preencha os quatro com o mesmo texto, copiado do cartão CNPJ.

---

## 3. Pagamento — você

O gateway do Mercado Pago já está implementado. Falta apenas a credencial.

1. [Painel de desenvolvedor do Mercado Pago](https://www.mercadopago.com.br/developers/panel)
   → sua aplicação → **Access Token de produção**.
2. Railway → backend → *Variables* → `MP_ACCESS_TOKEN`.
3. Cadastrar a URL de webhook apontando para a API de produção, para que o
   status do pagamento volte sozinho.

Enquanto isso não existir, a reserva continua funcionando normalmente e o
pagamento é combinado à parte — o app avisa isso ao usuário.

---

## 4. Publicar o painel admin — CONCLUÍDO

No ar como segundo serviço do projeto no Railway, na mesma branch do backend.

<details>
<summary>Como foi publicado</summary>

Crie um **segundo serviço** no Railway apontando para o mesmo repositório e a
mesma branch do backend. Em *Settings*:

- **Railway Config File:** `railway.admin.json`
- **Networking → Generate Domain**, para o painel ganhar URL pública

O detalhe que engana: o `railway.json` da raiz aponta para o Dockerfile do
**backend**, e um serviço novo no mesmo repositório o adota sozinho — sem
apontar para `railway.admin.json`, o Railway constrói o backend de novo.

Nenhuma variável é necessária: a URL da API já é o padrão do Dockerfile
(sobrescreva com o build arg `VITE_API_URL` se um dia mudar de domínio).

</details>

---

## 5. Política de privacidade e termos — CONCLUÍDO, revisão jurídica recomendada

O texto dos dois documentos existe, está no ar, é exigido no cadastro e
**já contém todas as decisões oficiais do negócio** (versão 1.1.0).

**Onde está no ar** (páginas públicas, sem login, servidas pela própria API):

- https://festa-production.up.railway.app/legal/privacidade
- https://festa-production.up.railway.app/legal/termos

São essas as URLs que vão nos formulários da Apple e do Google. Quando a
Festaê tiver site próprio, basta apontar as variáveis `PRIVACY_POLICY_URL` e
`TERMS_OF_USE_URL` para lá — nenhum endereço está fixo no código.

**Decisões oficiais já incorporadas** (07/08/2026):

| Assunto | Decisão |
| --- | --- |
| Identificação | 68.155.380 MARIA LUIZA POCAI · CNPJ 68.155.380/0001-77 · Rua Coronel Manoel dos Passos Maia, 68, Apto 505, Jardim Itália, Chapecó/SC |
| Pagamento | 50% na reserva + 50% na retirada. Pix no lançamento; cartão em versão futura |
| Cancelamento | +15 dias: 100% · 15 a 8 dias: 75% · 7 a 3 dias: 50% · menos de 72h: sem reembolso |
| Entrega | Retirada na sede. Entrega conforme disponibilidade, com taxa de deslocamento aprovada antes da reserva |
| Danos | Cliente responde pelos itens da retirada até a devolução; reparo ou reposição conforme avaliação apresentada antes da cobrança |
| Fotos / IA | Cláusula já publicada: uso exclusivo para gerar a visualização pedida, sem divulgação sem autorização específica |

**O que ainda vale fazer:** um advogado ler o texto. Ele descreve o serviço
corretamente; a revisão é para conferir se descreve de um jeito que proteja a
Festaê num conflito real. Não bloqueia a publicação nas lojas.

> ⚠️ **Pendência de produto, não de texto.** Os Termos dizem *retirada na
> sede, entrega opcional com taxa*. O aplicativo ainda pede "Endereço de
> entrega" e diz "A gente entrega, monta e recolhe". Alinhar o app ao modelo
> oficial é item P0 da Sprint 3 — publicar com essa divergência é prometer o
> que a operação não faz.

Depois de qualquer alteração no texto, suba a versão em
`packages/shared/src/legal.ts` (`TERMS_VERSION`): o aceite de cada cliente
guarda a versão que ele leu, e sem subir o número o histórico fica errado.

---

## 6. Conteúdo do catálogo — você

Vários produtos estão sem foto e sem descrição. Um catálogo com "Foto em
breve" não vende e pesa na avaliação da loja. Isso se resolve pelo painel
admin, depois do item 4.

Também é preciso preparar, para a ficha de cada loja: screenshots nos
tamanhos exigidos, descrição, categoria e classificação etária.

---

## 7. O que falta no código — a fazer aqui

- [x] **Exclusão de conta dentro do app.** Perfil → *Excluir minha conta*.
      Apaga nome, e-mail, telefone e endereços; mantém pedidos e reservas sem
      vínculo com pessoa identificável, porque a empresa precisa cumprir a
      entrega contratada e guardar o registro fiscal. Descreva exatamente isso
      na política de privacidade (item 5).
- [x] **Recuperação de senha — versão manual.** No login há *Esqueci minha
      senha*, que abre o WhatsApp da Festaê com a mensagem pronta. Um ADMIN
      define a senha nova em *Clientes → Nova senha* e a combina com a pessoa.
      Trocar para recuperação automática por e-mail depois exige um provedor
      transacional (Resend, SendGrid, SES).
- [x] **Documentos legais dentro do app e na web.** Mesmo texto nos dois
      lugares, lido de `packages/shared/src/legal.ts`. No app abre sem
      internet; na web é página pública para as fichas das lojas.
- [x] **Aceite obrigatório no cadastro.** Caixa desmarcada por padrão, com os
      dois documentos abrindo ao toque, e o botão *Criar conta* travado até
      marcar. O backend recusa o cadastro sem o aceite — não adianta chamar a
      API direto.
- [x] **Registro de consentimento.** Data e versão dos termos ficam gravadas
      na conta e aparecem em *Clientes → Aceite dos termos*, no painel.
- [x] **Exportação de dados (LGPD).** Perfil → Minha Conta → *Solicitar
      exportação dos meus dados*. Gera na hora um arquivo com perfil, festas,
      pedidos, pagamentos e histórico de uso.
- [x] **Rate limiting.** 120 requisições por minuto por IP em geral, e 5 por
      minuto no login e no cadastro — o suficiente para inviabilizar
      tentativa de senha por força bruta.
- [x] **Cabeçalhos de segurança (helmet) e HSTS.**
- [x] **Trocar a senha derruba as sessões abertas.** Testado ponta a ponta:
      admin redefine a senha → o token antigo passa a devolver 401 na
      requisição seguinte. Sem isso, redefinir a senha de quem suspeita de
      invasão não expulsaria o invasor.
- [ ] **Refresh token.** Não existe. Hoje o token de sessão vale 7 dias e,
      ao expirar, a pessoa faz login de novo. Nenhuma das duas lojas exige
      refresh token, e com a invalidação por troca de senha o risco residual
      é pequeno. Backlog P3.
- [ ] **Recuperação de senha automática por e-mail.** Continua manual, pelo
      WhatsApp (ver acima).
- [ ] **Testes automatizados.** Não há nenhum. O CI roda build, typecheck e
      migrations. Vale cobrir ao menos o cálculo do orçamento, o split de
      pagamento e a disponibilidade de data.
