import type { Veredicto } from "../lib/schemas";

const etiquetas: Record<Veredicto, string> = {
  liberado: "CLEAR / LIBERADO",
  revisar: "WARNING / REVISAR",
  retenido: "CRITICAL / RETENIDO",
};

const pillEstilos: Record<Veredicto, string> = {
  liberado: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
  revisar: "bg-amber-500/15 text-amber-400 border border-amber-500/35 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
  retenido: "bg-rose-500/15 text-rose-400 border border-rose-500/35 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
};

export function VeredictoEtiqueta({
  veredicto,
  size = "normal",
}: {
  veredicto: Veredicto;
  size?: "normal" | "grande";
}) {
  const pillClase = pillEstilos[veredicto];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono font-bold text-[11px] tracking-wider uppercase transition-all ${pillClase} ${
        size === "grande" ? "text-xs px-4 py-1.5" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          veredicto === "liberado"
            ? "bg-emerald-400 shadow-[0_0_6px_#10b981]"
            : veredicto === "revisar"
              ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]"
              : "bg-rose-400 shadow-[0_0_6px_#f43f5e]"
        }`}
      />
      <span>{etiquetas[veredicto]}</span>
    </span>
  );
}