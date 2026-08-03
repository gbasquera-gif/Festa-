# Checklist de lançamento

O que falta para o app ir para as lojas. Cada item diz quem faz: **você**
(painéis externos, contas, credenciais) ou **código** (a fazer no repositório).

---

## 1. Bucket das imagens — você · faz agora

Sem isso, toda foto de kit e produto some no próximo deploy do backend.

1. **Criar o bucket.** [dash.cloudflare.com](https://dash.cloudflare.com) → **R2**
   → *Create bucket* → nome `festae-catalogo`, localização automática.
2. **Deixar as imagens públicas.** No bucket → *Settings* → *Public access*.
   Habilite o subdomínio `r2.dev` ou conecte um domínio próprio
   (ex.: `cdn.festae.com.br`). **Copie essa URL pública.**
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

---

## 2. Contas das lojas — você · faz agora

As duas contas são de **organização**, no CNPJ da Festaê. Este é o único item
que não acelera com trabalho: são prazos de calendário. Comece por aqui.

### 2.1 D-U-N-S (bloqueia as duas lojas)

É o identificador da empresa exigido tanto pela Apple quanto pelo Google, e
**o mesmo número serve para as duas** — pede-se uma vez só.

**Situação: solicitado.** Aguardando o e-mail de confirmação da Dun &
Bradstreet. Se não chegar em alguns dias úteis, confira a caixa de spam antes
de pedir de novo — pedido duplicado atrasa em vez de acelerar.

1. Consulte se a empresa já tem um, pelo
   [buscador da Apple](https://developer.apple.com/enroll/duns-lookup/).
   Muita empresa já possui sem saber.
2. Se não houver, solicite ali mesmo. É gratuito por esse caminho.
3. Preencha **razão social, endereço e telefone exatamente como constam no
   CNPJ**. Divergência de pontuação, abreviação ou endereço é a causa número
   um de atraso — o pedido volta para correção e o prazo reinicia.
4. Prazo típico de alguns dias úteis, mas pode passar disso.

### 2.2 Domínio e e-mail corporativo

As duas lojas verificam a empresa por site e e-mail no domínio próprio, e a
política de privacidade (item 5) também precisa de uma URL. Se ainda não
existir domínio da Festaê no ar, registre agora — costuma ser o gargalo
escondido, porque só se descobre no meio do cadastro.

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

## 4. Publicar o painel admin — você

`apps/admin/Dockerfile` está pronto, mas ninguém o está usando: o
`railway.json` aponta só para o backend. Crie um **segundo serviço** no
Railway, no mesmo repositório, com *Dockerfile path* = `apps/admin/Dockerfile`.
Sem isso a operação não consegue cadastrar produto nem gerenciar reserva fora
da sua máquina.

---

## 5. Política de privacidade e termos — você

Obrigatórios nas duas lojas, hospedados numa URL pública. O app coleta nome,
e-mail, telefone e endereço de entrega — isso precisa estar declarado tanto no
texto quanto nos formulários *App Privacy* (Apple) e *Data safety* (Google).

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
- [ ] **Testes automatizados.** Não há nenhum. O CI roda build, typecheck e
      migrations. Vale cobrir ao menos o cálculo do orçamento, o split de
      pagamento e a disponibilidade de data.
