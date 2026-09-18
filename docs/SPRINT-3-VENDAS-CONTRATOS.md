# Sprint 3 — Vendas e Contratos

## O que esta sprint resolve

A área Financeiro sabia somar, mas não sabia mostrar de quem era o dinheiro.
A Visão Geral dizia o total a receber e parava aí. Para descobrir quem
devia, de qual festa e desde quando, era preciso sair do Financeiro, abrir a
lista operacional de Reservas e conferir contrato por contrato — que é
exatamente o trabalho manual que o ERP existe para eliminar.

Vendas/Contratos é a carteira: as mesmas reservas, lidas pelo lado do dinheiro.

## A decisão que não foi tomada: não existe entidade Venda

`Reservation + Order` **é** o contrato. Não há tabela `Venda`, e não vai haver.

Uma tabela paralela precisaria ser mantida em sincronia com a reserva a cada
remarcação de data, troca de item ou ajuste de valor. A primeira vez que
alguém esquecesse, o faturamento e a agenda passariam a contar festas
diferentes — e foi literalmente esse o defeito do painel antigo, onde a mesma
festa existia como reserva no sistema e como linha numa planilha, e as duas
discordavam sem ninguém perceber.

Consequência prática: **esta tela não cria venda**. O botão "Venda
administrativa" leva ao mesmo `/reservas/nova` que a operação usa, que já
confere capacidade do dia e estoque item a item. Um segundo formulário aqui
seria um segundo caminho para criar contrato, e o segundo caminho é sempre o
que esquece uma regra.

## A regra de inadimplência, num lugar só

> Saldo aberto + festa já passada = vencido.

Mora em `packages/shared/src/financeiro.ts`, na função `situacaoDePagamento`,
e em nenhum outro lugar. Nem o serviço nem a tela recalculam: o servidor
decide e a tela exibe o rótulo que recebeu.

Isso é resposta a um defeito concreto do painel antigo, onde cada aba decidia
por conta própria o que era "em aberto" — uma olhava o campo de sinal, outra
comparava status por texto, a terceira não olhava data nenhuma. O mesmo
contrato aparecia quitado numa tela e pendente na outra, e não havia como
saber qual estava certa, porque nenhuma delas era a regra: todas eram cópias.

### Por que não existe campo de vencimento no banco

O saldo é pago na retirada ou na entrega, que acontecem no dia da festa. O
vencimento já é um dado que o sistema tem. Criar uma coluna para ele seria
pedir à operação que digitasse uma data que o sistema sabe deduzir — e um
campo digitado é um campo que pode divergir.

### A borda: o dia da festa ainda está no prazo

A comparação é por **dia do calendário em Chapecó**, nunca por instante.
Comparar timestamps faria a festa de hoje virar "vencida" às 9h da manhã,
quando o saldo ainda vai ser pago na entrega da tarde. Vencido começa no dia
seguinte. Há teste para a véspera, para o dia (inclusive às 23h de Chapecó,
que já é o dia seguinte em UTC) e para o dia posterior.

### As cinco situações

| Situação | Quando | O que significa |
|---|---|---|
| `QUITADO` | saldo zero | nada a receber |
| `VENCIDO` | saldo aberto e festa já passou | dinheiro em risco |
| `PARCIAL` | parte recebida, festa ainda vem | sinal recebido, saldo no prazo |
| `AGUARDANDO` | nada recebido, festa ainda vem | venda fechada, dinheiro nenhum |
| `CANCELADO` | reserva cancelada ou rejeitada | fora da apuração |

## A ordem da lista não é cronológica

Ordenar por data da festa põe o que já venceu no fim — o dinheiro em risco
fica abaixo de tudo que está em dia, e quem abre a tela vê primeiro o que não
precisa de ação.

A ordem é: vencido primeiro (do atraso mais antigo, que é o que cobra pior),
depois o que ainda vem (da festa mais próxima, que é a ordem em que o saldo
vai vencer), e por último quitado e cancelado, que não pedem nada de ninguém.

## Canceladas aparecem e não somam

Continuam na lista, riscadas, porque quem administra comercialmente precisa
ver o que caiu. Não entram em total nenhum: é o campo `vigente` que decide, e
o resumo só soma vigentes. A tela declara isso por escrito, em vez de deixar o
usuário descobrir que a conta não fecha.

## Conciliação: por que os números não podem divergir da Visão Geral

A lista de status vigentes (`STATUS_VIGENTES`) mora em `contratos.ts` e é
importada pelo cálculo de indicadores, em vez de repetida. Se as duas
divergissem, a carteira e a saúde financeira passariam a somar conjuntos
diferentes — e a conciliação entre as duas telas, que é como se descobre um
erro, deixaria de valer.

Três igualdades verificadas a cada validação:

    resumo.saldoEmAberto    == indicadores.aReceber
    resumo.recebido         == indicadores.recebidoAcumulado
    resumo.recebidoSemData  == indicadores.recebidoSemData

Mais duas identidades internas:

    contratado − recebido   == saldo em aberto
    vencido                 <= saldo em aberto   (é recorte, não parcela somada)

## O que continua não sendo calculado

O resultado gerencial **não considera depreciação do acervo**, como declarado
desde a Sprint 2. Vida útil e valor residual são coletados; nenhum cálculo os
usa.

## Limite conhecido

A lista não pagina. Com 27 contratos isso é irrelevante, e os filtros (mês da
festa, situação, busca) dão conta. Numa carteira de centenas, a tela do
celular fica longa e vai precisar de paginação ou de rolagem virtual — não foi
feito agora porque resolver um problema que ainda não existe custa código que
precisa ser mantido desde já.
