# Backlog — decisões adiadas com data

Coisas que foram discutidas, decididas e **conscientemente deixadas para
depois**. Não é lista de ideias: cada item aqui já foi analisado, tem um
motivo escrito para não ter sido feito na hora e um gatilho que diz quando
deixa de poder esperar.

---

## Reaceite dos Termos de Uso em mudança material

**Registrado em:** 07/09/2026 · **Origem:** Sprint Operacional

Hoje `TERMS_VERSION` é gravada em `User.termsAcceptedVersion` só no cadastro.
Não existe fluxo que peça o aceite de novo quando a versão sobe.

Isso ficou visível quando a regra de montagem mudou e os Termos passaram de
1.3.0 para 1.4.0: o texto vigente afirmava que não havia montagem para
pedidos retirados na sede, e deixou de ser verdade. Quem criou conta antes
tem registrado o aceite de uma versão que já não descreve o serviço.

**Por que não foi feito agora:** a mudança de 1.4.0 é favorável ao cliente
(uma opção a mais pelo mesmo preço de sempre), então nenhum cliente foi
prejudicado por não ter reaceito. Construir o fluxo de reaceite no meio de
uma Sprint operacional teria misturado dois assuntos.

**Quando deixa de poder esperar:** na primeira mudança material
*desfavorável* ao cliente — preço, prazo de cancelamento, responsabilidade
por danos. Aí o aceite anterior não cobre mais o que está sendo contratado.

**Forma mínima sugerida:** antes de confirmar uma reserva, comparar
`user.termsAcceptedVersion` com `TERMS_VERSION`; se diferirem, mostrar o que
mudou e pedir o aceite, gravando a nova versão. Não precisa ser um bloqueio
no login — precisa ser um passo antes de contratar.

---

## ~~Edição completa de reserva manual~~ — feita em 08/09/2026

**Registrado em:** 07/09/2026 · **Origem:** Sprint Operacional
**Entregue em:** 08/09/2026 — `PATCH /reservations/:id` e a tela
`/reservas/:id/editar`.

Os dois obstáculos que a adiaram foram resolvidos assim:

1. `isDateAvailable` e `conflitosDeItens` passaram a aceitar ignorar a
   própria reserva. Sem isso nenhuma edição passaria: a festa disputaria
   vaga e material consigo mesma.
2. Pagamento não é campo do formulário. A edição muda os valores do pedido;
   o saldo se recalcula a partir do que já foi recebido, e nenhuma linha de
   `Payment` é criada, alterada ou apagada.

**O que continua fora:** registrar um pagamento novo pelo painel (o saldo
recebido depois do sinal) — segue como item próprio abaixo.

---

## Origem da venda no Funil

**Registrado em:** 07/09/2026 · **Origem:** Sprint Operacional

`Event.saleChannel` já é gravado em toda reserva — a da loja como `WEB`, a
manual pelo que a operação marcar. O Funil ainda não separa por canal.

**Por que não foi feito agora:** decisão explícita de escopo. O dado está
sendo coletado desde já justamente para que, quando a tela existir, ela
tenha história para mostrar em vez de começar do zero.

**Quando deixa de poder esperar:** quando houver volume para a comparação
significar alguma coisa — dezenas de vendas por canal, não unidades.

---

## Registro de recebimento do saldo

**Registrado em:** 07/09/2026 · **Origem:** Sprint Operacional

O sinal é registrado; o saldo aparece como valor em aberto e vira pendência
perto da festa, mas não há onde marcar que foi recebido.

**Quando deixa de poder esperar:** quando a operação começar a usar a tela
de Próximas Ações para cobrar — a pendência "saldo a receber" vai continuar
acesa depois de paga, e uma pendência que não some é uma pendência que as
pessoas aprendem a ignorar.
