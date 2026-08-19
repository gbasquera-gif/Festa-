# Logs de execução

Cada execução do agente gera um registro aqui, no formato:

```
[YYYY-MM-DD HH:MM] módulo=<trafego|atendimento|analise>
fonte: <Meta Ads MCP | Google Ads MCP>
ação/recomendação: <descrição>
status: <recomendada|aprovada|rejeitada|executada>
aprovado_por: <nome, se aplicável>
```

Fase 1 (piloto): todos os registros terão status `recomendada` — nenhuma
execução automática ainda.
