/**
 * rotar-cli — el guard de la ceremonia.
 *
 * `rotar` reescribe la privada y mete un certificado en el ledger PARA SIEMPRE
 * (append-only: el motivo queda por escrito y no se puede corregir). Comprueba
 * que la ceremonia NO corre cuando el argumento huele a flag desconocido —
 * por error real: `rotar --ayuda` dictó el motivo «--ayuda» y rotó la llave
 * de la casa. Ahora rotar se niega antes de tocar nada.
 *
 * Sólo se prueban los caminos de RECHAZO (salen antes de tocar ficheros):
 * la sucesión feliz la cubre tests/rotacion.test.ts con rotarYCertificar.
 *
 * Referencia: scripts/rotar.ts, tienda/rotacion.ts, docs/INCIDENTE.md.
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const correr = promisify(execFile);
const raiz = resolve(import.meta.dirname, "..");
const tsx = resolve(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
const guion = join(raiz, "scripts", "rotar.ts");
const ledgerRuta = join(raiz, "tienda", "rotaciones.json");

/**
 * Rotar se sale por la puerta de error: execFile aquí se designa que CORRIÓ
 * (el proceso acabó en failure) pero su stdout/stderr vienen con el por qué.
 */
export async function salidaChequeada(args: string[]): Promise<{ salida: string; codigo: number | undefined }> {
  const e = await correr(tsx, [guion, ...args]).then(
    (r) => ({ salida: r.stdout, codigo: 0 }),
    (err: { stdout: string; stderr: string; code: number | undefined }) => ({
      salida: `${err.stdout}\n${err.stderr}`,
      codigo: err.code,
    })
  );
  return e;
}

describe("rotar (la ceremonia se protege a sí misma)", () => {
  it("se niega con una flag que no entiende — y dice que nada se ha rotado", async () => {
    const { salida, codigo } = await salidaChequeada(["--ayuda"]);
    expect(codigo).not.toBe(0);
    expect(salida).toContain("rotar no entiende flags");
    expect(salida).toContain("Nada se ha rotado");
  });

  it("exige el motivo por escrito — una llave no muere sin causa", async () => {
    const { salida, codigo } = await salidaChequeada([]);
    expect(codigo).not.toBe(0);
    expect(salida).toContain("falta el motivo");
  });

  it("en ambos rechazos el ledger queda con los MISMOS bytes (la sucesión no corrió)", async () => {
    const antes = readFileSync(ledgerRuta, "utf8");
    await salidaChequeada(["--ayuda"]);
    await salidaChequeada([]);
    expect(readFileSync(ledgerRuta, "utf8")).toBe(antes);
  });
});
