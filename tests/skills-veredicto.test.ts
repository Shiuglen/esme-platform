import { describe, expect, it } from "vitest";
import { generarPar } from "../tienda/firma.ts";
import {
  cuerpoVeredictos,
  firmaVeredictos,
  juzgaCatalogo,
  juzgaSkill,
  renderPanelSkills,
  verificaVeredictos,
  veredictoDe,
  type SkillCatalogo,
} from "../tienda/skills.ts";

const skill = (extra: Partial<SkillCatalogo> = {}): SkillCatalogo => ({
  id: "anthropics/frontend-design",
  nombre: "frontend-design",
  grupo: "Diseño",
  repo: "anthropics/skills",
  ruta: "skills/frontend-design",
  commit: "dbd4588f9e1033efb41dad4bef2f7947c8993d44",
  arbolSha256: "89a6e59de80320a32e8b4c597a329ef3c503f624a2e68874bb0475dfb66dbf4b",
  licencia: "Apache-2.0",
  tieneScripts: false,
  ficheros: 2,
  bytes: 19564,
  revisadoEl: "2026-10-20",
  ...extra,
});

describe("el juez de las skills", () => {
  it("una skill íntegra entra con nivel ok", () => {
    const v = juzgaSkill(skill());
    expect(v.entra).toBe(true);
    expect(v.nivel).toBe("ok");
  });

  it("sin commit fijado no entra: no se puede probar qué es", () => {
    const v = juzgaSkill(skill({ commit: "" }));
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("commit");
  });

  it("sin huella del árbol no entra: no se puede probar qué se descarga", () => {
    const v = juzgaSkill(skill({ arbolSha256: "abc" }));
    expect(v.entra).toBe(false);
    expect(v.causa).toContain("huella");
  });

  it("una licencia que no deja redistribuir no entra", () => {
    const v = juzgaSkill(skill({ licencia: "proprietaria" }));
    expect(v.entra).toBe(false);
    expect(v.nivel).toBe("fuera");
    expect(v.causa).toContain("licencia");
  });

  it("traer scripts entra, pero avisa", () => {
    const v = juzgaSkill(skill({ tieneScripts: true }));
    expect(v.entra).toBe(true);
    expect(v.nivel).toBe("aviso");
    expect(v.causa).toContain("scripts");
  });

  it("un árbol de más de 1 MiB entra, pero avisa", () => {
    const v = juzgaSkill(skill({ bytes: 2 * 1024 * 1024 }));
    expect(v.entra).toBe(true);
    expect(v.nivel).toBe("aviso");
    expect(v.causa).toContain("MiB");
  });

  it("un id repetido no juzga dos veces: la segunda queda fuera", () => {
    const r = juzgaCatalogo([skill(), skill()]);
    expect(r.veredictos).toHaveLength(2);
    expect(r.fuera).toBe(1);
    expect(r.veredictos[1].causa).toContain("repetido");
  });

  it("el veredicto viene ordenado por id (los bytes firmados son estables)", () => {
    const r = juzgaCatalogo([skill({ id: "z/uno" }), skill({ id: "a/dos" })]);
    expect(r.veredictos.map((v) => v.id)).toEqual(["a/dos", "z/uno"]);
  });
});

describe("el veredicto firmado", () => {
  const par = generarPar();
  const documento = () =>
    firmaVeredictos(
      {
        version: 1,
        emitido: 1_700_000_000_000,
        firmante: par.huella,
        skills: juzgaCatalogo([skill()]).veredictos,
      },
      par.priv
    );

  it("firma y verifica con ida y vuelta sana", () => {
    const r = verificaVeredictos(JSON.stringify(documento()), par.pub);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skills).toHaveLength(1);
      expect(r.skills[0].id).toBe("anthropics/frontend-design");
    }
  });

  it("cambiar el veredicto rompe la firma", () => {
    const doc = documento();
    doc.skills[0].medidas.arbolSha256 = "0".repeat(64);
    const r = verificaVeredictos(JSON.stringify(doc), par.pub);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("cambió");
  });

  it("otra clave pública no verifica", () => {
    const otra = generarPar();
    const r = verificaVeredictos(JSON.stringify(documento()), otra.pub);
    expect(r.ok).toBe(false);
  });

  it("firmar con una clave y cambiar el firmante se nota", () => {
    const doc = documento();
    doc.firmante = "0000000000000000";
    const r = verificaVeredictos(JSON.stringify(doc), par.pub);
    expect(r.ok).toBe(false);
  });

  it("el cuerpo firmado es un JSON con las claves en orden fijo", () => {
    const cuerpo = cuerpoVeredictos({
      version: 1,
      emitido: 1,
      firmante: "abc",
      skills: juzgaCatalogo([skill()]).veredictos,
    });
    expect(cuerpo.startsWith('{"version":1,"emitido":1,"firmante":"abc","skills":[')).toBe(true);
  });

  it("el veredicto de una skill concreta se encuentra por id", () => {
    const doc = documento();
    expect(veredictoDe(doc, "anthropics/frontend-design")).not.toBeNull();
    expect(veredictoDe(doc, "no/existe")).toBeNull();
  });
});

describe("el panel del veredicto", () => {
  it("cuenta las que entran, avisan y quedan fuera", () => {
    const { veredictos } = juzgaCatalogo([
      skill({ id: "a/ok" }),
      skill({ id: "b/aviso", tieneScripts: true }),
      skill({ id: "c/fuera", licencia: "proprietaria" }),
    ]);
    const panel = renderPanelSkills({
      version: 1,
      emitido: 1_700_000_000_000,
      firmante: "abc",
      skills: veredictos,
    });
    expect(panel).toContain("3 skills juzgadas · 2 entran · 1 con aviso · 1 fuera");
    expect(panel).toContain("| a/ok | ✓ ok |");
    expect(panel).toContain("| b/aviso | ⚠ aviso |");
    expect(panel).toContain("| c/fuera | ✗ fuera |");
  });
});
