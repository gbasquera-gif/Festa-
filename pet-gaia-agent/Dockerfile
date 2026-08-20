FROM node:22-slim

# Claude Code CLI — orquestrador do agente.
# Versão fixada em 2.1.236: no momento em que isso foi escrito, o pacote
# principal tinha acabado de publicar a 2.1.237 mas o binário nativo
# correspondente (@anthropic-ai/claude-code-linux-x64) ainda não tinha
# propagado no registry do npm, o que quebra `claude --version` com "native
# binary not installed". Fixar os dois na mesma versão evita esse
# descompasso. Pode subir a versão manualmente quando quiser, mas teste
# `claude --version` antes de confiar no deploy.
RUN npm install -g @anthropic-ai/claude-code@2.1.236

WORKDIR /app
COPY . /app

# Corrige quebra de linha CRLF caso o repositório tenha sido clonado no
# Windows (o Git às vezes converte LF -> CRLF, o que quebra o shebang
# "#!/usr/bin/env bash" dentro do container Linux).
RUN sed -i 's/\r$//' /app/scripts/run-agent.sh && chmod +x /app/scripts/run-agent.sh

# Fase 1 (piloto): a máquina Fly é iniciada sob agendamento (fly machine run
# --schedule, ver fly.toml), executa um ciclo completo e encerra — não é um
# daemon com cron próprio dentro do container.
ENTRYPOINT ["/app/scripts/run-agent.sh"]
