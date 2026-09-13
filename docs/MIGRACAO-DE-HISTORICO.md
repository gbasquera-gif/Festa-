# Migrar histórico não é criar reserva

Proposta de modelagem. **Nada disto foi implementado ainda** — é o desenho para
aprovação antes da carga real.

## 1. O problema

A carga histórica e a venda nova hoje passariam pelo mesmo caminho, e esse
caminho valida regra comercial vigente: entrega só em Chapecó, tabela de taxas,
capacidade do dia. Um contrato que **já aconteceu** e foi honrado não passa
nessas regras — não porque esteja errado, mas porque a pergunta não se aplica.

Validar política comercial responde *devemos aceitar isto?* — uma pergunta que
só faz sentido **antes** do acordo. Sobre um acordo já cumprido ela não protege
ninguém: ou bloqueia o registro, ou obriga a adulterar o dado para ele passar.

As duas saídas são ruins, e a segunda é pior: um histórico adulterado mente
para sempre, em silêncio.

## 2. A separação

Validação tem duas camadas, que hoje estão misturadas:

| camada | o que responde | migração | reserva nova |
|---|---|---|---|
| **integridade** | o dado é coerente consigo mesmo? | **sim** | sim |
| **política comercial** | devemos aceitar este negócio? | **não** | sim |

Integridade continua valendo na migração, inteira: o total tem de fechar, a
data da festa tem de ser real, pagamento não pode passar do contrato, o mesmo
contrato não pode entrar duas vezes. É o que impede a carga de corromper o
banco.

Política comercial não se aplica a fato consumado.

## 3. Dois caminhos, não uma flag

```
manualReservation.criar(dados, usuarioId)        // inalterado, valida tudo
historico.registrar(dados, procedencia)          // integridade só
```

**Por que não uma flag** `pularValidacao: true` em `criar()`: um booleano num
parâmetro é uma linha de distância entre a venda de amanhã e a regra que
protege a margem. Basta um `true` errado — ou um formulário que mande o campo
sem querer — para uma venda real furar a regra sem ninguém notar.

Dois nomes diferentes tornam o caminho perigoso uma escolha explícita. Ele fica
fora do controller do painel, sem rota HTTP, disponível só para script de carga
rodado por quem tem acesso ao banco.

## 4. O rastro: exceção comercial, não o nome de uma cidade

A cidade é dado — ela vive na reserva, e nenhuma regra deve citá-la pelo nome.
O que precisa de nome estável é **a regra que foi excepcionada**.

```prisma
enum OrigemDoRegistro {
  /// Nasceu aqui e passou por todas as regras vigentes.
  OPERACAO
  /// Fato consumado, importado de sistema anterior.
  MIGRACAO
}

/// Uma regra comercial que foi deixada de lado, e por quê.
///
/// Não é campo na reserva porque uma reserva pode ter mais de uma, e porque a
/// pergunta interessante é pela regra, não pela reserva: "quantas entregas
/// fora da cidade atendida já fizemos, e a que custo?" só tem resposta se a
/// exceção for uma linha consultável.
model ExcecaoComercial {
  id            String   @id @default(cuid())
  reservationId String

  /// Qual regra. Chave estável, não texto livre — texto livre não se agrupa.
  regra         String

  /// O que foi combinado, em português, para quem ler daqui a dois anos.
  justificativa String

  /// Quem decidiu. Nulo só na migração, onde a decisão é anterior ao sistema.
  autorizadaPorId String?
  autorizadaEm    DateTime @default(now())
}
```

### Por que isto serve também para o futuro

A mesma estrutura resolve a exceção negociada numa venda **nova**, sem conceito
novo: a regra bloqueia, *a menos que* venha uma exceção autorizada junto. A
diferença entre migração e venda nova vira só quem assina — na migração
ninguém, porque a decisão é anterior ao sistema.

E a regra geral continua intacta. Nada é flexibilizado globalmente.

## 5. Como fica o contrato com entrega fora da cidade atendida

Preservado como aconteceu, sem adulterar nada:

| campo | valor | observação |
|---|---|---|
| cidade | a da festa | como na operação, sem alterar |
| modalidade | entrega com montagem | como na operação |
| taxa de entrega | R$ 0,00 | foi cortesia, e é isso que o registro diz |
| taxa de montagem | R$ 0,00 | idem |
| valor do contrato | o contratado | inalterado |
| origem do registro | `MIGRACAO` | |
| exceções | duas linhas | ver abaixo |

```
regra: ENTREGA_FORA_DA_CIDADE_ATENDIDA
justificativa: Entrega realizada fora de Chapecó por negociação pontual.
               A regra geral de atender entrega só em Chapecó segue valendo.

regra: TAXA_DE_ENTREGA_CORTESIA
justificativa: Entrega e montagem sem custo para o cliente, combinado na venda.
```

A taxa zerada **não** é adulteração: cobrar R$ 0,00 foi o que aconteceu. Gravar
os R$ 70,00 da tabela é que seria inventar uma cobrança que nunca existiu — e
ainda faria o total da reserva discordar do valor do contrato.

## 6. O que isto não resolve

A exportação antiga guarda **um valor só** por contrato. Ela não diz quanto
daquele total era serviço e quanto era taxa. Para os contratos em Chapecó com
entrega, portanto, não dá para saber se a taxa estava embutida no valor ou se
foi cortesia também.

A migração vai gravar o total exato — que é o que alimenta todos os
indicadores — e taxa zero, declarando que a decomposição é desconhecida. Se a
operação souber a resposta contrato a contrato, dá para decompor depois sem
mexer em nenhum total.
