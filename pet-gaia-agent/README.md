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
horário de Brasília.
