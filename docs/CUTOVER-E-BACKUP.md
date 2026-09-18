# Backup, cutover e rollback da unificação

Regra que manda em tudo aqui: **se não dá para provar que voltamos ao estado
anterior, a migração não acontece.** Backup que ninguém testou não é backup, é
esperança.

## 1. As duas fontes ainda aceitam escrita

| fonte | quem escreve | risco durante a migração |
|---|---|---|
| PostgreSQL (Admin) | loja, painel, API | uma venda nova entra no meio da carga |
| Netlify Blobs (painel antigo) | qualquer pessoa com o endereço | um lançamento entra depois da fotografia |

O segundo é pior: a API do painel antigo não tem autenticação e aceita
`set`, `importar` e `apagar`. Enquanto ele estiver no ar, qualquer um escreve.

## 2. Backup do PostgreSQL

Duas camadas, porque uma só não basta.

### 2.1 Dump lógico, feito por você

```
railway link                 # projeto fabulous-ambition
railway status               # conferir Environment: production
railway connect Postgres --tunnel-only
```

Isso abre um túnel e imprime host, porta, usuário, senha e a URL. Com o túnel
aberto, noutro terminal:

```
pg_dump "<URL que o comando imprimiu>" --format=custom --file=festae-antes-da-carga.dump
```

Guardar **fora do repositório** — ele é público.

### 2.2 A recuperação que o Railway já mantém

O Railway mantém recuperação para o Postgres gerenciado (`railway postgres`,
seção de point-in-time recovery). Vale como segunda rede, não como primeira:
ela depende do provedor estar bem no momento em que você precisar.

### 2.3 Como provar que o backup presta

Sem este passo o backup não conta:

```
createdb festae_verificacao
pg_restore --dbname=festae_verificacao festae-antes-da-carga.dump
```

E no banco restaurado, rodar `apps/backend/scripts/inventario-producao.sql`.
**Os números têm de bater com os do inventário de produção, linha por linha.**
Se qualquer contagem divergir, o backup está incompleto e a migração não sai.

## 3. Backup do painel financeiro

O painel tem uma aba **Backup**. Ela gera o JSON com tudo — vendas, contas,
aportes, meta. É o caminho mais simples e não depende de ferramenta nenhuma.

Alternativa, se a aba falhar: `GET https://painel.festaechapeco.com.br/.netlify/functions/dados`
devolve o estado inteiro. É leitura.

Guardar fora do repositório, com a data no nome.

A cópia do código e do HTML já está preservada em `legado/painel-financeiro/`,
sem os dados.

## 4. Cutover

A ordem importa. O objetivo é que a janela em que alguém pode escrever numa
fonte não migrada seja a menor possível.

1. **Inventário das duas fontes** — `inventario-producao.sql` no Postgres, aba
   Backup no painel. Guardar os dois arquivos.
2. **Backup verificado** do Postgres (§2.3). Sem isto, parar aqui.
3. **Congelar o painel antigo — despublicando o deploy.**

   Eu havia recomendado proteção por senha. **Não serve neste caso:** a conta
   está no plano `nf_team_dev` do Netlify, e proteção por senha é recurso de
   plano pago. Conferido pela API: o site reporta `requiresPassword: false`,
   sem opção de ligar.

   O caminho que funciona em qualquer plano é **despublicar o deploy** na área
   de Deploys do site. O endereço passa a responder 404 — inclusive a função
   que grava — e nada é apagado: o histórico de deploys continua lá, e o store
   `festae` do Netlify Blobs também. Republicar é um clique, se precisar de
   contingência.

   Despublicar fecha as duas portas de uma vez: a escrita sem autenticação e
   os dados no HTML público.
4. **Fotografia final** do painel — exportar de novo, já congelado. É esta
   exportação que a carga usa, não a do passo 1.
5. **Dry-run contra produção**, com a exportação final. Ler as divergências.
6. **Carga** com `--aplicar`.
7. **Conferência**: rodar o inventário de novo e comparar com o esperado que o
   dry-run imprimiu. Depois conferir pela tela do painel novo.
8. **Liberar o Admin unificado** para uso.
9. **Repontar `painel.festaechapeco.com.br`** para o Admin.
10. **Contingência curta**: manter o site antigo acessível só por senha, por
    período combinado, sem receber lançamento novo.
11. **Desligamento definitivo**, com o backup guardado.

### Por que congelar antes da fotografia final

Se a exportação for feita com o painel ainda aberto, alguém pode lançar algo
entre a exportação e a carga — e esse lançamento se perde sem deixar rastro,
porque a origem não tem histórico. Congelar primeiro elimina a janela.

### E o Admin, congela?

Não. Ele continua recebendo venda normalmente durante a carga: a carga só
**cria** o que falta e nunca altera reserva existente, então uma venda nova
entrando no meio não corre risco. Ela simplesmente não estará na fotografia —
e como a carga é idempotente e por união, isso não quebra nada.

## 5. Rollback

Três níveis, do mais barato ao mais caro:

| nível | o que desfaz | quando usar |
|---|---|---|
| `desfazer-carga-historica.ts --aplicar` | só o que a carga criou, pela referência `legado:` | erro na carga, banco íntegro |
| `pg_restore` do dump | o banco inteiro ao estado anterior | corrupção, ou perda que o nível 1 não alcança |
| recuperação do Railway | idem, pelo provedor | se o dump falhar |

O nível 1 já foi testado de verdade: carga, contagem, rollback, contagem — as
tabelas voltaram exatamente ao estado anterior.

O painel antigo **não é desligado** em nenhum momento antes da conferência, o
que significa que a fonte financeira original continua intacta e disponível
mesmo no pior caso.

## 6. Riscos

| risco | gravidade | tratamento |
|---|---|---|
| lançamento novo no painel durante a migração | **alto** | congelar antes da fotografia final (§4.3) |
| painel antigo sem autenticação, aceitando `apagar` | **alto** | despublicar o deploy fecha isso — §4.3 |
| `.netlify.app` continua aceitando escrita depois da troca de DNS | **alto** | mudar o DNS não desliga o site; só despublicar desliga |
| dados financeiros no HTML público | **alto** | sai do ar junto com o painel |
| backup não testado | **alto** | §2.3 é obrigatório |
| divergência de pagamento entre as bases | médio | relatada, nunca sobrescrita; revisão manual |
| mesmo negócio nas duas bases com nomes diferentes | médio | cruzamento por data e valor, e revisão do que sobrar |
| recebimento sem data | médio | fica fora do caixa mensal até saneamento |
| carga interrompida no meio | baixo | transacional por contrato: ou entra inteiro, ou não entra |
| rodar a carga duas vezes | baixo | idempotente, verificado em três execuções |

## 7. Apontar o domínio para o Admin

O bundle do Admin chama a API por URL absoluta, embutida em tempo de build
(`VITE_API_URL`, com padrão `https://festa-production.up.railway.app/api/v1`),
e o backend sobe com `cors: true`. Ou seja: **servir o Admin em outro domínio
não exige reconfigurar nada** — nem variável de ambiente, nem lista de origens.

O que exige configuração é só o domínio:

1. No Railway, serviço `alert-compassion` → Settings → Public Networking →
   **+ Custom Domain** → `painel.festaechapeco.com.br`.
2. O Railway devolve **dois** registros: um `CNAME` e um `TXT`. Os dois são
   obrigatórios — só com o CNAME o domínio responde 404, porque é o TXT que
   comprova a posse antes de o Railway rotear o tráfego.
3. Criar os dois no provedor de DNS, exatamente como mostrados.
4. Esperar o visto verde no painel do Railway. O certificado Let's Encrypt sai
   sozinho, em geral dentro de uma hora.

Antes disso, o mesmo nome precisa deixar de estar reivindicado no Netlify —
hoje ele é o `primarySiteUrl` do site do painel antigo — senão os dois
serviços disputam o mesmo domínio.
