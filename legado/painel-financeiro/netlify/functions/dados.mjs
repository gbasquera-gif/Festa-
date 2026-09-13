// netlify/functions/dados.mts
import { getStore } from "@netlify/blobs";
var STORE = "festae";
var KEY = "estado";
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
var dados_default = async (req, _context) => {
  const store = getStore({ name: STORE, consistency: "strong" });
  if (req.method === "GET") {
    const dados = await store.get(KEY, { type: "json" }) || {};
    return json({ ok: true, dados });
  }
  if (req.method === "POST") {
    let corpo;
    try {
      corpo = await req.json();
    } catch {
      return json({ ok: false, erro: "corpo inv\xE1lido" }, 400);
    }
    if (!corpo || typeof corpo !== "object") {
      return json({ ok: false, erro: "corpo inv\xE1lido" }, 400);
    }
    const dados = await store.get(KEY, { type: "json" }) || {};
    if (corpo.acao === "set") {
      const chave = String(corpo.chave || "");
      if (chave === "" || !chave.startsWith("festae:")) {
        return json({ ok: false, erro: "chave inv\xE1lida" }, 400);
      }
      dados[chave] = String(corpo.valor);
      await store.setJSON(KEY, dados);
      return json({ ok: true });
    }
    if (corpo.acao === "importar") {
      const lote = corpo.dados && typeof corpo.dados === "object" ? corpo.dados : {};
      let n = 0;
      for (const chave in lote) {
        if (!chave.startsWith("festae:")) continue;
        dados[chave] = String(lote[chave]);
        n++;
      }
      await store.setJSON(KEY, dados);
      return json({ ok: true, importadas: n });
    }
    if (corpo.acao === "apagar") {
      const chave = String(corpo.chave || "");
      delete dados[chave];
      await store.setJSON(KEY, dados);
      return json({ ok: true });
    }
    return json({ ok: false, erro: "a\xE7\xE3o desconhecida" }, 400);
  }
  return json({ ok: false, erro: "m\xE9todo n\xE3o permitido" }, 405);
};
var config = {
  path: "/api/dados"
};
export {
  config,
  dados_default as default
};
