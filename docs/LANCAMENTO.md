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

Este é o único item que não acelera com trabalho: são prazos de calendário.
Abra as duas contas antes de qualquer outra coisa.

- **Google Play Console** — US$ 25, pagamento único. Exige verificação de
  identidade. Contas novas podem precisar de um período de teste fechado com
  um número mínimo de testadores antes de liberar produção; confirme a regra
  vigente no próprio console, porque o Google mudou isso mais de uma vez.
- **Apple Developer Program** — US$ 99/ano. Se for registrar como empresa,
  é preciso o número **D-U-N-S**, cuja emissão pode levar semanas. **Peça
  primeiro**, mesmo que o resto ainda não esteja pronto.

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

- [ ] **Exclusão de conta dentro do app.** A Apple reprova app com cadastro
      que não ofereça isso. Não existe endpoint nem tela.
- [ ] **Recuperação de senha.** Não bloqueia a loja, mas hoje quem esquecer a
      senha vira atendimento manual.
- [ ] **Testes automatizados.** Não há nenhum. O CI roda build, typecheck e
      migrations. Vale cobrir ao menos o cálculo do orçamento, o split de
      pagamento e a disponibilidade de data.
