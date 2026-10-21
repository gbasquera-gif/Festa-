# Publicação, backup e contingência: aprovação manual, retiradas, saldo e pró-labore

Três migrations, todas aditivas. Nenhuma altera ou apaga dado existente.

| Migration | O que acrescenta |
|---|---|
| `20261021120000_aprovacao_manual_e_retiradas` | origem, autor e chave nos pagamentos; status `ANULADO`; histórico de alterações financeiras; sócios e retiradas |
| `20261022120000_saldo_de_caixa` | saldos iniciais da conta |
| `20261023120000_natureza_pro_labore` | natureza `PRO_LABORE` nas despesas |

Produção antes desta publicação: commit `4c30da8`, última migration `20261019190000_assistente_uso`.

## 1. Antes de publicar (nada aqui altera dados reais)

1. **Identificar o estado atual.**
   - Branch `claude/festaê-app-llk596` no commit `4c30da8`.
   - No banco de produção, rodar `verificar-banco.sql`. Ele só lê. Deve mostrar `ultima_migration = 20261019190000_assistente_uso` e `migrations_com_falha = 0`. Guarde a saída: é a "foto" de referência.
2. **Backup no Railway.** Serviço do Postgres → aba **Backups** → backup manual. Confira que ele aparece com a data e a hora de agora. O backup manual tem limite de 50% do tamanho do volume, e apagar o volume apaga os backups dele.
3. **pg_dump guardado fora do Railway.**
   - Rode `pg_dump "<URL pública do banco>" -Fc -f festae-AAAAMMDD-HHMM.dump`.
   - A URL fica nas variáveis do serviço do Postgres (`DATABASE_PUBLIC_URL`). Nunca cole essa URL em chat, e-mail ou repositório.
   - Guarde o arquivo em local seguro e com acesso restrito: ele contém dados de clientes.
4. **Teste de restauração isolado.**
   - O backup do Railway só pode ser restaurado no mesmo projeto e ambiente, então o teste isolado é feito com o pg_dump.
   - Num Postgres local (por exemplo `docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=<senha-local> postgres:16`), rode `./testar-restauro.sh festae-AAAAMMDD-HHMM.dump postgresql://postgres:<senha-local>@localhost:5433`.
   - A foto impressa precisa ser igual à do passo 1.
   - O script recusa qualquer endereço que não seja local.

## 2. Publicar

Avançar o branch de produção até o commit aprovado, sem forçar. O Railway reconstrói, e o entrypoint aplica só as três migrations acima.

Depois, rodar `verificar-banco.sql` de novo. A última migration deve ser `20261023120000_natureza_pro_labore`, e as contagens e somas devem ser iguais às da foto anterior.

## 3. Contingência: voltar a uma versão estável sem tocar em dados

**Quando usar:** se a versão nova apresentar um problema que exija tirá-la do ar.

**O que é:** o código que estava em produção (`4c30da8`) mais o schema e as migrations do commit publicado. Ou seja:
- o código antigo passa a conhecer `ANULADO` e `PRO_LABORE` e lê tudo como está gravado;
- nenhuma migration é desfeita;
- nenhum registro é convertido;
- nenhuma classificação muda.

**Passos:**

1. `./preparar-contingencia.sh <commit-publicado>`: cria o commit de contingência num branch local. O pai dele é o commit publicado.
2. Enviar esse commit para o branch de produção (avanço normal, sem forçar). O entrypoint roda `migrate deploy`, que não tem nada a aplicar, e o seed de sempre.

**Enquanto durar:**
- Ficam fora do ar a aprovação manual, a correção de pagamento, as retiradas, o saldo disponível e a natureza Pró-labore na tela.
- Os dados dessas funcionalidades ficam intactos no banco.
- Os pagamentos anulados aparecem com o status `ANULADO` e ficam fora de todas as somas.
- As despesas de pró-labore ficam fora do Resultado Operacional, como na versão nova, mas não aparecem na tela de Despesas antiga.
- As permissões voltam às de antes: o OPS volta a poder registrar pagamento.

**Voltar à versão nova:** `git revert <commit-de-contingência>` e enviar. Nada mais precisa ser feito, porque os dados não foram tocados.
