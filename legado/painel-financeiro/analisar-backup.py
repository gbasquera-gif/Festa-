#!/usr/bin/env python3
"""Lê uma exportação do painel financeiro e apura os números da Sprint 0.

    python3 analisar-backup.py caminho/para/backup-festae.txt

O arquivo de entrada NÃO pode ficar neste repositório: ele é público e a
exportação contém faturamento e dados de cliente. Ver README, "Onde está o
backup".

Este script existe para que nenhum número do relatório dependa de conferência
manual. Na primeira apuração parte dos lançamentos foi lida à mão e um total
saiu errado.
"""
import json
import sys
import unicodedata
from collections import defaultdict

# Termos que identificam o que o painel chama de "aporte" mas é despesa.
# Ajuste aqui quando surgir categoria nova — e confira a lista impressa.
CUSTEIO = ["meta ads", "zoho", "dominio", "curso", "avental"]
CONSUMIVEL = ["balao", "baloes", "fita", "cola e spray", "linha", "tinta",
              "bomba", "capas e sacolas"]


def sem_acento(texto):
    decomposto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in decomposto if unicodedata.category(c) != "Mn")


def mes(data):
    """Aceita ISO e DD/MM/AAAA — a exportação mistura os dois formatos."""
    data = str(data).strip()
    if "/" in data:
        dia, mes_, ano = data.split("/")
        return f"{ano}-{mes_:0>2}"
    return data[:7]


def brl(valor):
    return f"R$ {valor:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def quitado(venda):
    return str(venda.get("status", "")).strip().lower() == "pago"


def classificar(aporte):
    finalidade = sem_acento(aporte["finalidade"])
    if any(termo in finalidade for termo in CUSTEIO):
        return "CUSTEIO"
    if any(termo in finalidade for termo in CONSUMIVEL):
        return "CONSUMIVEL"
    return "ACERVO"


def carregar(caminho):
    bruto = json.loads(open(caminho, encoding="utf-8").read())
    return {chave: (json.loads(valor) if isinstance(valor, str) else valor)
            for chave, valor in bruto.items()}


def main(caminho):
    dados = carregar(caminho)
    vendas = dados.get("festae:vendas", [])
    contas = dados.get("festae:contas", [])
    aportes = dados.get("festae:aportes", [])

    contratado = sum(v["valor"] for v in vendas)
    # O valor recebido está gravado em DOIS lugares que podem discordar: o campo
    # `sinal` e a string `status`. Um contrato quitado fica com status "Pago" e
    # `sinal` continua zerado — somar só o campo `sinal` subestima o caixa.
    # Foi assim que a primeira apuração errou o total.
    recebido = sum(v["valor"] if quitado(v) else v["sinal"] for v in vendas)
    print(f"CONTRATOS: {len(vendas)} | contratado {brl(contratado)} | "
          f"recebido {brl(recebido)} | a receber {brl(contratado - recebido)}")
    for venda in vendas:
        if quitado(venda) and venda["sinal"] == 0:
            print(f"  quitado pelo status, com campo sinal zerado: "
                  f"{venda['num']} {brl(venda['valor'])}")

    por_contrato = defaultdict(float)
    por_festa = defaultdict(float)
    for venda in vendas:
        por_contrato[mes(venda["data"])] += venda["valor"]
        por_festa[mes(venda["dataEvento"])] += venda["valor"]

    despesas = defaultdict(float)
    for conta in contas:
        quando = conta.get("dataPgto") or conta.get("venc") or conta.get("data")
        despesas[mes(quando)] += conta["valor"]

    classes = defaultdict(list)
    for aporte in aportes:
        classes[classificar(aporte)].append(aporte)

    total_aportes = sum(a["valor"] for a in aportes)
    print(f"\nAPORTES: {len(aportes)} lançamentos, {brl(total_aportes)}")
    for classe in ("ACERVO", "CONSUMIVEL", "CUSTEIO"):
        soma = sum(a["valor"] for a in classes[classe])
        pct = soma / total_aportes * 100 if total_aportes else 0
        print(f"  {classe:<11} {len(classes[classe]):>3} lançamentos  "
              f"{brl(soma):>13}  ({pct:.1f}%)")
        if classe != "ACERVO":
            for aporte in sorted(classes[classe], key=lambda a: mes(a["data"])):
                print(f"      {str(aporte['data'])[:10]:<10} "
                      f"{aporte['finalidade'][:48]:<48} {brl(aporte['valor'])}")
    disfarcada = sum(a["valor"] for a in classes["CONSUMIVEL"] + classes["CUSTEIO"])
    print(f"  despesa lançada como capital: {brl(disfarcada)}")

    fora_de_contas = defaultdict(float)
    for aporte in classes["CONSUMIVEL"] + classes["CUSTEIO"]:
        fora_de_contas[mes(aporte["data"])] += aporte["valor"]

    print("\nLUCRO — o que o painel exibe vs. o que é")
    meses = sorted(set(por_contrato) | set(por_festa) | set(despesas) | set(fora_de_contas))
    for m in meses:
        exibido = por_contrato[m] - despesas[m]
        real = por_festa[m] - despesas[m] - fora_de_contas[m]
        print(f"  {m}  painel {brl(exibido):>13}   corrigido {brl(real):>13}")

    print("\nREGIME DE CAIXA: não apurável. A origem guarda o valor do sinal,")
    print("nunca a data em que ele entrou.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
