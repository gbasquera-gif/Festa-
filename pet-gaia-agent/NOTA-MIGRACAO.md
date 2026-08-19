# Nota de migração — leia antes de continuar o setup

Este diretório (`pet-gaia-agent/`) deveria viver em um repositório próprio,
`gbasquera-gif/pet-gaia-agent`, e não dentro do `Festa-`. O repositório
**já foi criado** no GitHub, mas na tentativa de configurar o acesso do app do
Claude a ele, o fluxo esbarrou duas vezes em uma tela de "Configurações da
organização" que o plano atual da conta não acessa (recurso Team/Enterprise).

Como o piloto da Pet Gaia não podia ficar bloqueado por causa disso, a decisão
(alinhada com o usuário) foi seguir o setup aqui dentro do `Festa-`, isolado
nesta pasta, e migrar depois.

## Como migrar quando o acesso for liberado

1. Confirmar acesso: peça para o app do Claude (ou você mesmo, via `gh` ou pelo
   site) conseguir ler/escrever em `gbasquera-gif/pet-gaia-agent`.
2. Extrair o histórico desta pasta preservando os commits:
   ```bash
   git subtree split --prefix=pet-gaia-agent -b pet-gaia-agent-export
   ```
3. Publicar no repositório definitivo:
   ```bash
   git push git@github.com:gbasquera-gif/pet-gaia-agent.git pet-gaia-agent-export:main
   ```
4. Confirmar que tudo chegou no repo novo, depois remover `pet-gaia-agent/` deste
   repositório (`Festa-`) em um commit separado, com mensagem explicando a migração.
5. Apagar a branch local `pet-gaia-agent-export`.

## Por que isso importa

Os dois negócios (Pet Gaia e Festaê) não devem compartilhar repositório,
credenciais ou regras de negócio no longo prazo — isso é temporário, só para
não travar o piloto.
