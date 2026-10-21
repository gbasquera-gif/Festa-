import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decidirAdministrador, PEDIDO_DA_INSTALACAO, type EntradaDoAdmin } from "./administrador";

const base: EntradaDoAdmin = {
  email: "admin@exemplo.test",
  senha: "senha-da-variavel",
  conta: null,
  haOutroAdminAtivo: false,
  pedidoJaAplicado: false,
};
const admin = { role: "ADMIN", deletedAt: null };

describe("decidirAdministrador", () => {
  it("sem as variáveis, não faz nada", () => {
    assert.equal(decidirAdministrador({ ...base, email: undefined }).acao, "NADA");
    assert.equal(decidirAdministrador({ ...base, senha: "" }).acao, "NADA");
  });

  it("instalação sem nenhum ADMIN: cria", () => {
    assert.deepEqual(decidirAdministrador(base), { acao: "CRIAR", pedido: PEDIDO_DA_INSTALACAO });
  });

  it("conta inexistente, mas já há outro ADMIN: não cria sozinho", () => {
    assert.equal(decidirAdministrador({ ...base, haOutroAdminAtivo: true }).acao, "PRESERVAR");
  });

  it("conta existente: preserva senha, papel e situação em todo boot", () => {
    assert.equal(decidirAdministrador({ ...base, conta: admin }).acao, "PRESERVAR");
  });

  it("não reativa conta excluída nem devolve ADMIN a quem foi rebaixado", () => {
    assert.equal(decidirAdministrador({ ...base, conta: { role: "ADMIN", deletedAt: new Date() } }).acao, "PRESERVAR");
    assert.equal(decidirAdministrador({ ...base, conta: { role: "OPS", deletedAt: null } }).acao, "PRESERVAR");
  });

  it("recuperação explícita: aplica, e promove só se a conta não for ADMIN", () => {
    assert.deepEqual(decidirAdministrador({ ...base, conta: admin, pedido: "2026-10-22-senha-perdida" }), {
      acao: "RECUPERAR",
      pedido: "2026-10-22-senha-perdida",
      promover: false,
    });
    const rebaixada = decidirAdministrador({ ...base, conta: { role: "OPS", deletedAt: null }, pedido: "pedido-1" });
    assert.deepEqual(rebaixada, { acao: "RECUPERAR", pedido: "pedido-1", promover: true });
  });

  it("o mesmo pedido não se repete nos reinícios seguintes", () => {
    const d = decidirAdministrador({ ...base, conta: admin, pedido: "pedido-1", pedidoJaAplicado: true });
    assert.equal(d.acao, "PRESERVAR");
  });

  it("recuperação não reativa conta excluída", () => {
    const d = decidirAdministrador({ ...base, conta: { role: "ADMIN", deletedAt: new Date() }, pedido: "pedido-1" });
    assert.equal(d.acao, "RECUSAR");
  });

  it("recuperação de e-mail que não existe cria, mesmo havendo outro ADMIN (é pedido explícito)", () => {
    assert.deepEqual(decidirAdministrador({ ...base, haOutroAdminAtivo: true, pedido: "novo-admin" }), { acao: "CRIAR", pedido: "novo-admin" });
  });

  it("pedido inválido ou sem as outras variáveis é recusado", () => {
    assert.equal(decidirAdministrador({ ...base, conta: admin, pedido: "x" }).acao, "RECUSAR");
    assert.equal(decidirAdministrador({ ...base, conta: admin, pedido: "tem espaço" }).acao, "RECUSAR");
    assert.equal(decidirAdministrador({ ...base, conta: admin, pedido: PEDIDO_DA_INSTALACAO }).acao, "RECUSAR");
    assert.equal(decidirAdministrador({ ...base, senha: undefined, conta: admin, pedido: "pedido-1" }).acao, "RECUSAR");
  });

  it("pedido em branco vale como ausente", () => {
    assert.equal(decidirAdministrador({ ...base, conta: admin, pedido: "   " }).acao, "PRESERVAR");
  });
});
