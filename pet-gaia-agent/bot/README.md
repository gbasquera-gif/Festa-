# Bot de aprovação (Telegram)

Fluxo simples pedido no plano original: o agente manda a recomendação, você
aprova ou rejeita direto do Telegram, do celular.

## Por que é um app Fly separado do agente principal

O `pet-gaia-agent` (raiz deste repositório) roda como uma máquina Fly **sob
agendamento** — liga às 08h e 18h, executa um ciclo, desliga (ver
`../fly.toml`). Ela não fica de pé o dia inteiro.

Para o Telegram entregar o clique de "Aprovar"/"Rejeitar" (via webhook), é
preciso ter algo escutando **o tempo todo** — inclusive fora dos horários do
ciclo. Por isso este é um segundo app Fly (`pet-gaia-agent-bot`), sempre
ativo, e os dois não compartilham disco: o agente principal manda mensagens
(via `../scripts/notify-telegram.js`, ao fim de cada ciclo) e este serviço
só recebe as respostas — nenhum dos dois lê o estado do outro em disco.

## Fase 1 (piloto)

Aprovar ou rejeitar aqui **só registra a decisão** em `decisoes.log` (no
volume `/data`). Nenhuma ação é executada automaticamente a partir disso —
isso só muda quando a fase de piloto terminar (ver `../rules/guardrails.md`).
Serve, por enquanto, para você confirmar que viu e concordou (ou não) com
cada recomendação, com registro auditável.

## Setup

1. **Criar o bot no Telegram**: fale com [@BotFather](https://t.me/BotFather)
   → `/newbot` → siga as instruções → guarde o token (`TELEGRAM_BOT_TOKEN`).
2. **Descobrir seu `chat_id`**: mande qualquer mensagem para o seu bot, depois
   acesse `https://api.telegram.org/bot<TOKEN>/getUpdates` e veja o campo
   `message.chat.id` da resposta.
3. **Deploy deste app**:
   ```bash
   cd pet-gaia-agent/bot
   fly launch --copy-config --name pet-gaia-agent-bot
   fly volumes create pet_gaia_bot_data --region gru --size 1
   fly secrets set TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 20)
   fly deploy
   ```
4. **Registrar o webhook no Telegram** (aponte para a URL pública do app Fly):
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://pet-gaia-agent-bot.fly.dev/telegram-webhook" \
     -d "secret_token=<mesmo valor de TELEGRAM_WEBHOOK_SECRET>"
   ```
5. **No app principal** (`pet-gaia-agent`), configurar como secrets:
   `TELEGRAM_BOT_TOKEN` (o mesmo token) e `TELEGRAM_CHAT_ID` (do passo 2) —
   são usados por `../scripts/notify-telegram.js` para enviar as mensagens.

## Variáveis de ambiente

| Variável | Onde é usada | Obrigatória |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `bot/server.js` e `scripts/notify-telegram.js` | Sim |
| `TELEGRAM_CHAT_ID` | `scripts/notify-telegram.js` (para onde enviar) | Sim, no app principal |
| `TELEGRAM_WEBHOOK_SECRET` | `bot/server.js` (valida que o webhook é mesmo do Telegram) | Recomendado |
| `DATA_DIR` | `bot/server.js` (onde gravar `decisoes.log`) | Não — default `/data` |
