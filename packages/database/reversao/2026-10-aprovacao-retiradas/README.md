# Publicação, backup e contingência: aprovação manual, retiradas, saldo e pró-labore

Três migrations, todas aditivas. Nenhuma altera ou apaga dado existente.

| Migration | O que acrescenta |
|---|---|
| `20261021120000_aprovacao_manual_e_retiradas` | origem, autor e chave nos pagamentos; status `ANULADO`; histórico de alterações financeiras; sócios e retiradas |
| `20261022120000_saldo_de_caixa` | saldos iniciais da conta |
| `20261023120000_natureza_pro_labore` | natureza `PRO_LABORE` nas despesas |

Produção antes desta publicação: commit `4c30da8`, última migration `20261019190000_assistente_uso`.

## 1. Antes de publicar: backup (nada aqui altera dados reais)

### No Windows: `backup-windows.ps1`

Precisa de Docker Desktop aberto e 7-Zip (`winget install 7zip.7zip`). Baixe esta pasta do GitHub (branch `financeiro/aprovacao-manual-e-retiradas`). Depois, abra o PowerShell nela e rode:

```powershell
powershell -ExecutionPolicy Bypass -File .\backup-windows.ps1
```

O script guia cada passo e para no primeiro problema. Etapas:

1. **Backup no Railway, na tela.** Pede que você confira os backups existentes, crie um manual e anote o commit do deploy ativo.
2. **Endereço do banco.** Pede a `DATABASE_PUBLIC_URL` (serviço do Postgres → Variables). Ela é colada sem aparecer na tela, fica só na memória daquela janela e é apagada no fim. Nunca vai para a linha de comando nem para arquivo.
3. **Foto e `pg_dump` no mesmo instante.** Ambos rodam numa transação **só de leitura**. A foto traz a última migration aplicada, contagens, somas e a assinatura de cada tabela (`verificar-banco.sql` + `assinaturas.sql`). Como o instantâneo é um só, a foto descreve exatamente o que o dump contém, mesmo com o sistema em uso.
4. **Restauração isolada.** O dump é restaurado num Postgres local, em container **sem rede**. Depois tira a mesma foto.
5. **Comparação.** Produção × restauro, linha a linha. `IGUAIS` quer dizer que cada tabela voltou com as mesmas linhas, coluna por coluna.
6. **Criptografia.** Dump e fotos vão para um `.7z` com AES-256 e senha digitada por você. O arquivo é conferido, e as cópias abertas são apagadas.

No fim, ele imprime um resumo sem valores: backup confirmado, commit ativo, última migration, `IGUAIS`/`DIFERENTES`. Guarde o `.7z` também fora do computador, e a senha num gerenciador de senhas.

### No Linux ou Mac

1. Rode `verificar-banco.sql` e `assinaturas.sql` em sessão só de leitura:
   `psql "<URL>" -X -qtA -F ' | ' -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" -f verificar-banco.sql -f assinaturas.sql`
2. Gere o dump: `pg_dump "<URL>" -Fc -f festae-AAAAMMDD-HHMM.dump`.
3. Teste a restauração: `./testar-restauro.sh <dump> postgresql://postgres:<senha-local>@localhost:5433`. Recusa endereço que não seja local.
4. As duas fotos precisam ser iguais. Rode num horário sem uso: aqui a foto e o dump não saem do mesmo instante.

## 2. Publicar

Avançar o branch de produção até o commit aprovado, sem forçar. O Railway reconstrói, e o entrypoint aplica só as três migrations acima.

Depois, rodar `verificar-banco.sql` de novo. A última migration deve ser `20261023120000_natureza_pro_labore`, e as contagens e somas devem ser iguais às da foto anterior.

## 3. Contingência: voltar a uma versão estável sem tocar em dados

**Quando usar:** se a versão nova apresentar um problema que exija tirá-la do ar.

**O que é:** o código que estava em produção (`4c30da8`) mais o schema e as migrations do commit publicado, mais `contingencia-permissoes.patch`. Ou seja:
- o código antigo passa a conhecer `ANULADO` e `PRO_LABORE` e lê tudo como está gravado;
- nenhuma migration é desfeita;
- nenhum registro é convertido;
- nenhuma classificação muda;
- as permissões financeiras da versão publicada continuam valendo (o patch é a única mudança no código antigo).

**Não use o Rollback do Railway para o deploy antigo.** A imagem de `4c30da8` tem o schema antigo e dá erro ao ler pagamento anulado ou despesa de pró-labore.

**Passos:**

1. `./preparar-contingencia.sh <commit-publicado>`: cria o commit de contingência num branch local. O pai dele é o commit publicado. Se o branch de contingência já estiver no GitHub e o commit publicado for o mesmo, pule este passo.
2. Enviar esse commit para o branch de produção (avanço normal, sem forçar). O entrypoint roda `migrate deploy`, que não tem nada a aplicar, e o seed de sempre.

**Enquanto durar:**
- Ficam fora do ar a aprovação manual, a correção e a anulação de pagamento, as retiradas, o saldo disponível e a natureza Pró-labore na tela.
- Os dados dessas funcionalidades ficam intactos no banco.
- Os pagamentos anulados aparecem com o status `ANULADO` e ficam fora de todas as somas.
- As despesas de pró-labore ficam fora do Resultado Operacional, como na versão nova, mas não aparecem na tela de Despesas antiga.
- Registrar recebimento, confirmar sinal e registrar devolução feita continuam só do ADMIN. O OPS cria venda com sinal a receber e cancela com reembolso a realizar, como na versão nova.
- O checkout e o aviso automático do Mercado Pago seguem funcionando.

**Voltar à versão nova:** `git revert <commit-de-contingência>` e enviar. Nada mais precisa ser feito, porque os dados não foram tocados.
