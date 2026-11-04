# Sandbox do Mercado Pago — validade mínima do Pix

Descobre, no ambiente de teste do Mercado Pago, a menor validade que um Pix
aceita **pelo mesmo caminho da produção**: `MercadoPagoGateway.createCheckout`
→ `POST /v1/payments` (SDK oficial), `payment_method_id: "pix"`,
`date_of_expiration` no formato `AAAA-MM-DDTHH:MM:SS.sss-00:00` e chave de
idempotência. Depois lê `GET /v1/payments/:id` para ver a validade gravada e
cancela cada cobrança.

Casos: 2, 5, 10, 15, 20, 29, 30 e 31 minutos, R$ 1,00 cada.

## Configuração (uma vez, feita pela dona do repositório)

1. No Mercado Pago (Suas integrações → aplicação → **Credenciais de teste**),
   copie o *Access Token* de teste. Não use a credencial de produção.
2. No GitHub: **Settings → Environments → New environment** →
   `mercadopago-sandbox`.
   - **Required reviewers**: marque você.
   - **Deployment branches and tags**: *Selected branches* →
     `teste/sandbox-validade-pix`.
   - **Environment secrets → Add secret**: nome `MP_SANDBOX_ACCESS_TOKEN`,
     valor = o token de teste.
3. Não crie esse segredo como *Repository secret* (ficaria disponível para
   outros workflows) e não cole o token em chat, código ou commit.

## Execução

O push do branch `teste/sandbox-validade-pix` inicia o workflow, que fica
**aguardando aprovação**. Aprove em *Actions → execução → Review deployments*.

## Proteções

- Para antes de criar qualquer cobrança se a credencial não for de teste
  (prefixo `TEST-`, ou conta `test_user`).
- Toda cobrança criada é conferida: `live_mode` precisa ser `false`; se não
  for, é cancelada na hora e o teste para.
- O log mostra só minutos, status e códigos de erro (o repositório é
  público): nada de token, QR, e-mail ou dados de conta.

## Depois

Apague o segredo (ou o Environment inteiro) e o branch de teste.
