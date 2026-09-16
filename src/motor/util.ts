// src/motor/util.ts
// Utilidades compartidas por analizadores y pipeline.

/** ID estable de hallazgo: el mismo regla+archivo+linea reutiliza el mismo id (permite actualizaciones SSE). */
export function idHallazgo(regla: string, archivo: string, linea?: number): string {
  const partes = [regla, archivo];
  if (linea !== undefined) partes.push(String(linea));
  return partes.join(":");
}

/** Mezcla de distancias para typosquatting. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

/** Normaliza el nombre de un paquete para comparar: minúsculas, sin espacios, scoped normalizado. */
export function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
}