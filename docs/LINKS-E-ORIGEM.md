# Links da loja e de onde vêm as visitas

Como publicar o link da loja para o painel conseguir dizer **de onde veio cada
reserva** — e não só quantas pessoas apareceram.

Endereço da loja: **https://reservas.festaechapeco.com.br**

---

## Por que isso importa

Sem marcar o link, toda visita entra no painel como "sem origem". Dá para
saber que 40 pessoas chegaram, mas não o que as trouxe — e aí não há como
decidir se vale a pena continuar postando no Instagram ou se o QR Code no
balcão funciona.

Com o link marcado, a tela **Funil** mostra, por origem: visitas, reservas,
festas pagas e receita. É a diferença entre "o Instagram traz gente" e "o
Instagram traz gente que paga R$ 520".

---

## Os links prontos

Copie e cole. Não é preciso entender os parâmetros — só usar o link certo em
cada lugar.

**Instagram** (bio, stories, posts)

```
https://reservas.festaechapeco.com.br/?utm_source=instagram&utm_medium=organic&utm_campaign=lancamento
```

**WhatsApp** (conversa, status, lista de transmissão)

```
https://reservas.festaechapeco.com.br/?utm_source=whatsapp&utm_medium=organic&utm_campaign=lancamento
```

**QR Code** (cartão, balcão, material impresso)

```
https://reservas.festaechapeco.com.br/?utm_source=qr&utm_medium=offline&utm_campaign=lancamento
```

**Google** (perfil da empresa, resultado de busca)

```
https://reservas.festaechapeco.com.br/?utm_source=google&utm_medium=organic&utm_campaign=lancamento
```

---

## O que cada pedaço quer dizer

| Parâmetro | O que responde | Valores usados |
|---|---|---|
| `utm_source` | **Onde** a pessoa viu o link | `instagram`, `whatsapp`, `qr`, `google` |
| `utm_medium` | **Que tipo** de divulgação | `organic` (post normal), `paid` (anúncio), `offline` (impresso) |
| `utm_campaign` | **Qual ação** de divulgação | `lancamento`, `natal2026`, `chas` |

Regras práticas:

- **Sempre minúsculo, sem acento e sem espaço.** `instagram` e `Instagram`
  viram duas linhas diferentes no relatório.
- **Mude só a campanha** quando começar uma divulgação nova. A origem
  continua a mesma; o que muda é o motivo.
- Se um dia houver anúncio pago, troque `utm_medium=organic` por
  `utm_medium=paid` — assim dá para comparar quanto o pago rende contra o que
  vem de graça.

---

## Como funciona por dentro

1. A pessoa abre o link. A loja lê os três parâmetros **no primeiro
   carregamento** e guarda na memória da visita.
2. A origem viaja junto com todos os eventos do funil, e não só com a visita.
3. Quando a festa é criada, a origem é **gravada na festa** — por isso a
   reserva e o pagamento continuam ligados à divulgação que os trouxe, mesmo
   dias depois.

**Limite conhecido:** a origem vive na aba aberta. Se a pessoa fechar o
navegador e voltar depois digitando o endereço, a segunda visita conta como
"direto". Isso subestima o Instagram e superestima o direto — é o
comportamento normal de qualquer medição desse tipo, e não vale mais
complexidade nesta fase.

**Sem UTM no link**, a loja tenta usar o site que encaminhou. O Instagram
costuma abrir links no navegador interno dele e muitas vezes não informa isso
— por isso o parâmetro no link publicado é o que de fato funciona.

---

## Onde ler o resultado

Painel → **Funil**. A tabela "De onde vieram" tem uma linha por origem, com
visitas, reservas, pagas e receita.

Os cartões do topo (visitas, reservas, pagas, ticket médio) contam **festas
de verdade**, vindas do banco. A tabela "Passo a passo" conta **cliques** — a
mesma visita pode abrir vários temas e kits, então serve para ver onde as
pessoas param, não como número exato.
