const RE_CARACTER_FORMATO = /\p{Cf}/u;

export function marcarInvisibles(texto: string): string {
  let salida = "";
  for (const caracter of texto) {
    if (RE_CARACTER_FORMATO.test(caracter)) {
      salida += `⟦U+${caracter
        .codePointAt(0)!
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")}⟧`;
    } else {
      salida += caracter;
    }
  }
  return salida;
}

export function formatearDuracion(ms?: number): string {
  if (ms === undefined) return "--:--";
  const segundos = Math.round(ms / 1000);
  const minutos = Math.floor(segundos / 60);
  const restoSeg = segundos % 60;
  return `${String(minutos).padStart(2, "0")}:${String(restoSeg).padStart(2, "0")}`;
}