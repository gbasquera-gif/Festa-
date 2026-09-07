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

## Edição completa de reserva manual

**Registrado em:** 07/09/2026 · **Origem:** Sprint Operacional

A correção de dados cobre nome, telefone, endereço e observações. Data,
itens e valores continuam exigindo cancelar e registrar de novo.

**Por que não foi feito agora:** dois obstáculos concretos.

1. `AvailabilityService.isDateAvailable` não aceita ignorar a própria
   reserva. Editar sem mudar a data já falharia por capacidade, e mexer
   nisso é alterar a trava que impede duas festas no mesmo dia.
2. Alterar valores reescreveria um pagamento que pode já ter sido recebido,
   sem deixar histórico do que foi mudado.

**Quando deixa de poder esperar:** quando a operação relatar que cancelar e
refazer está custando tempo demais, ou quando aparecer o primeiro caso de
remarcação de data com sinal já pago.

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
