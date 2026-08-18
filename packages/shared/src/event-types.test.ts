import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "./enums";
import {
  EVENT_TYPE_META,
  STOREFRONT_EVENT_TYPES,
  eventTypeFromSlug,
  eventTypeLabel,
  isEventType,
} from "./event-types";

describe("tipos de festa", () => {
  it("descreve todos os tipos do enum", () => {
    for (const type of EVENT_TYPES) {
      expect(EVENT_TYPE_META[type]).toBeDefined();
      expect(EVENT_TYPE_META[type].key).toBe(type);
    }
  });

  it("oferece na vitrine as quatro ocasiões atendidas, e não OUTRO", () => {
    expect(STOREFRONT_EVENT_TYPES.map((meta) => meta.key)).toEqual([
      "ANIVERSARIO",
      "CHA_DE_BEBE",
      "CHA_REVELACAO",
      "BATIZADO",
    ]);
  });

  // O slug vai na URL da vitrine: se dois tipos compartilhassem um, um deles
  // ficaria inalcançável e ninguém perceberia até um cliente reclamar.
  it("usa slugs únicos", () => {
    const slugs = Object.values(EVENT_TYPE_META).map((meta) => meta.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("volta do slug para o tipo", () => {
    for (const type of EVENT_TYPES) {
      expect(eventTypeFromSlug(EVENT_TYPE_META[type].slug)).toBe(type);
    }
    expect(eventTypeFromSlug("festa-inexistente")).toBeNull();
  });

  it("reconhece apenas tipos válidos", () => {
    expect(isEventType("ANIVERSARIO")).toBe(true);
    // O antigo FESTA_INFANTIL virou ANIVERSARIO na migração: link ou app
    // desatualizado não pode ser aceito como se ainda existisse.
    expect(isEventType("FESTA_INFANTIL")).toBe(false);
  });

  it("rotula com o nome que o cliente lê", () => {
    expect(eventTypeLabel("CHA_DE_BEBE")).toBe("Chá de bebê");
  });
});
