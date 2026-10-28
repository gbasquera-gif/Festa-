/**
 * Tarefa agendada de contas a pagar — um processo que roda e termina.
 *
 * No Railway é um serviço próprio, com agendamento (cron) e sem domínio nem
 * porta: não existe endpoint para disparar isto de fora. Ver
 * railway.avisos.json e docs/CONTAS-A-PAGAR.md.
 *
 *   node apps/backend/dist/tarefas/contas-a-pagar.js
 *
 * O log diz só contagens. Nunca descrição, valor, fornecedor ou e-mail.
 *
 * Fora de produção, AVISOS_AGORA (ISO 8601) fixa o relógio para testar um
 * dia qualquer. Em produção a variável é ignorada.
 */
import { prisma } from "@festae/database";
import { erroSeguro, executarTarefaDeContas } from "../modules/contas-a-pagar/avisos/processar";
import { transporteDoAmbiente } from "../modules/contas-a-pagar/avisos/transporte";

function relogio(): Date {
  const fixo = process.env.AVISOS_AGORA;
  if (fixo && process.env.NODE_ENV !== "production") {
    const agora = new Date(fixo);
    if (!Number.isNaN(agora.getTime())) return agora;
  }
  return new Date();
}

async function main() {
  const { transporte, motivo } = transporteDoAmbiente();
  const resumo = await executarTarefaDeContas({
    agora: relogio(),
    transporte,
    motivoSemEmail: motivo,
    painel: process.env.ADMIN_URL?.trim() || null,
  });
  console.log(`[contas-a-pagar] ${JSON.stringify(resumo)}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(`[contas-a-pagar] falhou: ${erroSeguro(e)}`);
    await prisma.$disconnect().catch(() => undefined);
    process.exitCode = 1;
  });
