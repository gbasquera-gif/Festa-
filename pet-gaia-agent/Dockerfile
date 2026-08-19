FROM node:22-slim

# Claude Code CLI — orquestrador do agente
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY . /app

RUN chmod +x /app/scripts/run-agent.sh

# Fase 1 (piloto): a máquina Fly é iniciada sob agendamento (fly machine run
# --schedule, ver fly.toml), executa um ciclo completo e encerra — não é um
# daemon com cron próprio dentro do container.
ENTRYPOINT ["/app/scripts/run-agent.sh"]
