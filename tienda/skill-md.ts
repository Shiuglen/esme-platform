/**
 * skill-md.ts — leer la cabecera de un SKILL.md (el estándar abierto de Agent Skills,
 * https://agentskills.io/specification): una cabecera YAML con `name` y `description`
 * obligatorios y el cuerpo con las instrucciones.
 *
 * El juez usa esto para la puerta de entrada: una skill sin cabecera legible no
 * sirve de nada, y enterarse al comprarla es tarde. Lector mínimo (claves
 * simples, comillas, bloques «>» y «|»): no hace falta YAML completo.
 */
export interface CabeceraSkill {
  name: string;
  description: string;
  licencia?: string;
  soloManual: boolean;
  cuerpo: string;
}

const sinComillas = (v: string): string => {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"'))
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
};

/** La cabecera como pares clave → texto (las claves anidadas se ignoran). */
export function cabeceraDe(yaml: string): Record<string, string> {
  const campos: Record<string, string> = {};
  const lineas = yaml.split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lineas[i]);
    if (!m) continue;
    const [, clave, valor] = m;
    if (/^[>|][+-]?$/.test(valor.trim())) {
      const bloque: string[] = [];
      while (
        i + 1 < lineas.length &&
        (/^\s+\S/.test(lineas[i + 1]) || lineas[i + 1].trim() === "")
      )
        bloque.push(lineas[++i].trim());
      campos[clave] = valor.trim().startsWith(">")
        ? bloque.filter(Boolean).join(" ")
        : bloque.join("\n").trim();
    } else if (valor.trim()) {
      campos[clave] = sinComillas(valor);
    } else {
      // valor en varias líneas SIN indicador: YAML lo pliega en una sola línea
      // (description: seguido de líneas indentadas). Si lo que sigue es un mapa
      // anidado (una clave con valor vacío), no es un valor: se ignora.
      const bloque: string[] = [];
      let anidado = false;
      while (
        i + 1 < lineas.length &&
        (/^\s+\S/.test(lineas[i + 1]) || lineas[i + 1].trim() === "")
      ) {
        const linea = lineas[++i];
        if (!linea.trim()) continue;
        if (/^\s+[A-Za-z0-9_-]+:\s*$/.test(linea)) {
          anidado = true;
          break;
        }
        bloque.push(linea.trim());
      }
      if (bloque.length && !anidado) campos[clave] = bloque.join(" ");
    }
  }
  return campos;
}

export type LecturaSkill =
  | { ok: true; skill: CabeceraSkill; avisos: string[] }
  | { ok: false; error: string };

/** Lee un SKILL.md. `carpeta` es el nombre de la carpeta (para avisar si no cuadra). */
export function leerSkillMd(texto: string, carpeta: string): LecturaSkill {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(texto);
  if (!m)
    return { ok: false, error: "el SKILL.md no empieza con su cabecera (--- … ---)" };
  const campos = cabeceraDe(m[1].replace(/\r/g, ""));
  if (!campos.name) return { ok: false, error: "falta el campo obligatorio «name»" };
  if (!campos.description)
    return { ok: false, error: "falta el campo obligatorio «description»" };
  const avisos: string[] = [];
  if (carpeta && campos.name !== carpeta)
    avisos.push(`su nombre («${campos.name}») no coincide con su carpeta («${carpeta}»)`);
  if (campos.name.length > 64)
    avisos.push("su nombre pasa de 64 caracteres (el estándar no lo permite)");
  if (campos.description.length > 1024)
    avisos.push("su descripción pasa de 1024 caracteres (el estándar no lo permite)");
  const cuerpo = m[2].replace(/\s+$/, "");
  if (!cuerpo.trim()) avisos.push("su cuerpo está vacío: no hay instrucciones que leer");
  return {
    ok: true,
    avisos,
    skill: {
      name: campos.name,
      description: campos.description,
      soloManual: campos["disable-model-invocation"] === "true",
      cuerpo,
      ...(campos.license ? { licencia: campos.license } : {}),
    },
  };
}
