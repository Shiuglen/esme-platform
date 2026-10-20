// crs-delta — la mente viaja por diferencias, no por peso completo.
// Formato del delta: base, actual, añadidos, eliminados y VIVOS (trozos que
// cambiaron su texto o su vector). Aplicar un delta reconstruye el estado
// actual y es verificable por cognición (la base se autodescribe).
import { cognicionDe, type RecuerdoPortatil } from "./mind-file.ts";

export interface DeltaMind {
  schema_version: 1;
  base_cognicion: string;
  actual_cognicion: string;
  añadidos: RecuerdoPortatil[];
  eliminados: string[];
  vivos: RecuerdoPortatil[];
}

/** La diferencia entre dos estados de mente, medible y verificable. */
export function deltaDe(
  viejos: RecuerdoPortatil[],
  nuevos: RecuerdoPortatil[]
): DeltaMind {
  const viejosId = new Map(viejos.map((v) => [v.id, v]));
  const nuevosId = new Map(nuevos.map((v) => [v.id, v]));

  const añadidos = nuevos.filter((n) => !viejosId.has(n.id));
  const eliminados = viejos.filter((v) => !nuevosId.has(v.id)).map((v) => v.id);
  const vivos = nuevos.filter((n) => {
    const v = viejosId.get(n.id);
    if (!v) return false;
    return (
      v.texto !== n.texto ||
      JSON.stringify(v.vector) !== JSON.stringify(n.vector) ||
      (v.fuente ?? null) !== (n.fuente ?? null)
    );
  });

  return {
    schema_version: 1,
    base_cognicion: cognicionDe(viejos),
    actual_cognicion: cognicionDe(nuevos),
    añadidos,
    eliminados,
    vivos,
  };
}

/** Aplica el delta a la base. NIEGA si la base no es la que el delta cree. */
export function aplicaDelta(
  base: RecuerdoPortatil[],
  d: DeltaMind
): { recuerdos: RecuerdoPortatil[]; violaciones: string[] } {
  const violaciones: string[] = [];
  const cognicionBase = cognicionDe(base);
  if (cognicionBase !== d.base_cognicion)
    violaciones.push(`la base tiene otra cognición: '${cognicionBase.slice(0, 12)}' no es la del delta`);

  if (violaciones.length) return { recuerdos: base, violaciones };

  // ids duplicados entre listas = delta mal armado: se niega antes de tocar nada
  const baseId = new Set(base.map((b) => b.id));
  const añadidosRepetidos = d.añadidos.filter((a) => baseId.has(a.id));
  if (añadidosRepetidos.length)
    violaciones.push(`añadidos ya presentes en la base: ${añadidosRepetidos.length}`);

  if (violaciones.length) return { recuerdos: base, violaciones };

  const vivosId = new Set(d.vivos.map((v) => v.id));
  const eliminadosId = new Set(d.eliminados);
  const añadidosId = new Set(d.añadidos.map((a) => a.id));

  const viejosPorId = new Map(base.map((b) => [b.id, b]));
  void viejosPorId;
  const result: RecuerdoPortatil[] = [];
  for (const r of base) {
    if (eliminadosId.has(r.id) || añadidosId.has(r.id)) continue;
    const vivo = vivosId.has(r.id) ? d.vivos.find((v) => v.id === r.id)! : r;
    result.push(vivo);
  }
  result.push(...d.añadidos);
  return { recuerdos: result, violaciones };
}
