# Pet Gaia — Agente de IA (Claude Code)

Agente orquestrado via Claude Code, rodando em cron no Fly.io, cobrindo três frentes:
tráfego pago (Meta Ads + Google Ads), atendimento ao cliente, e relatórios/análise.

> **Nota de organização:** este diretório vive temporariamente dentro do repositório
> `Festa-` por uma limitação de acesso do GitHub App no momento da criação (ver
> `NOTA-MIGRACAO.md`). O projeto Pet Gaia é independente da Festaê — nenhum conteúdo,
> credencial ou regra de negócio é compartilhado entre os dois. Assim que o acesso ao
> repositório `pet-gaia-agent` (já criado em `gbasquera-gif/pet-gaia-agent`) for
> liberado para o app, esta pasta é migrada via `git subtree split` preservando
> histórico, e removida daqui.

## Status atual: Fase 1 — Piloto (somente leitura)

Nenhuma ação de escrita (pausar campanha, mudar orçamento, responder cliente) é
executada automaticamente nesta fase. O agente apenas lê métricas e gera
recomendações. Toda ação de escrita passa por aprovação humana via Telegram.

## Estrutura

```
prompts/              → prompts de sistema para cada módulo (trafego, atendimento, analise)
rules/                → guardrails de negócio (limites de orçamento, tom de voz, escalonamento)
mcp-config/           → configuração dos servidores MCP (Meta Ads, Google Ads)
logs/                 → histórico de execuções e decisões do agente (auditável)
.github/workflows/    → CI (validação de configs antes de deploy)
```

## Módulos

| Módulo | Função | Status |
|---|---|---|
| `trafego` | Lê métricas (CPL, CTR, ROAS) via Meta Ads MCP e Google Ads MCP, recomenda ações | Piloto (leitura) |
| `atendimento` | Responde dúvidas recorrentes, qualifica leads, escala casos sensíveis | Não iniciado |
| `analise` | Relatório periódico cruzando CAC por canal com metas de crescimento | Piloto (leitura) |

## Aprovação humana

Qualquer ação de escrita (pausar anúncio, mudar orçamento acima do limite definido
em `rules/guardrails.md`) gera uma notificação via Telegram para aprovação antes
da execução. Nada é executado sem aprovação explícita nesta fase.

## Cron (Fly.io)

Execução agendada 2x/dia: 08:00 (revisão da madrugada) e 18:00 (ajuste fim de tarde),
horário de Brasília. Validado rodando de ponta a ponta em 23/08/2026 (ver `logs/`
e o histórico de decisões no bot do Telegram).

## Produção — apps Fly.io e segredos necessários

São dois apps Fly.io separados (ver `bot/README.md` para o porquê):

- **`pet-gaia-agent`** (esta pasta) — roda sob agendamento, executa um ciclo e desliga.
- **`pet-gaia-agent-bot`** (`bot/`) — sempre ativo, recebe os cliques de aprovar/rejeitar.

### Secrets do app `pet-gaia-agent`

| Secret | Para quê |
|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Autentica o Claude Code CLI em si (não é o MCP do Meta Ads — é uma credencial separada). Gerado com `claude setup-token` dentro da própria máquina (via `fly ssh console`), válido por 1 ano. **Copie o token direto do terminal onde ele aparece** — copiar de outro app (chat, navegador) pode corromper caracteres (hífen virando travessão, etc.) e quebrar a autenticação com erro "non-ASCII character". |
| `TELEGRAM_BOT_TOKEN` | Enviar as notificações (`scripts/notify-telegram.js`) |
| `TELEGRAM_CHAT_ID` | Para quem enviar |

### Arquivos no volume persistente (`/data`, nunca no repositório)

| Arquivo | Como chegou lá |
|---|---|
| `/data/mcp-servers.json` | Copiado manualmente via `fly ssh sftp shell` (a partir de `mcp-config/mcp-servers.json.example`) |
| `/data/.claude.json` e `/data/.claude/` | Gerados por `claude mcp add meta-ads ...` + `claude mcp login meta-ads --no-browser` (login OAuth do Business Manager), rodado uma única vez dentro da máquina |

**Detalhe importante:** definir `HOME=/data` no `[env]` do `fly.toml` **não funciona** — o
Fly.io ignora essa variável específica (confirmado testando em produção; o processo
sempre via `$HOME=/root`, mesmo com `HOME=/data` configurado). Por isso
`scripts/run-agent.sh` copia manualmente as credenciais entre `/data` e o `$HOME` real
a cada execução, em vez de depender dessa variável.

### Como entrar na máquina principal para debug/setup manual

Como ela roda sob agendamento (liga, executa, desliga), `fly ssh console` só funciona
enquanto ela está `started`. Para mantê-la de pé manualmente:

```bash
fly machine update <machine-id> -a pet-gaia-agent --entrypoint "sleep" --command "3600"
fly machine start <machine-id> -a pet-gaia-agent
fly ssh console -a pet-gaia-agent
# ... faça o que precisar ...
# depois, para voltar ao comportamento normal (não deixar em "sleep"):
fly deploy
```
