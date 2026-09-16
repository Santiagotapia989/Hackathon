import type { Veredicto } from "../lib/schemas";

const etiquetas: Record<Veredicto, string> = {
  liberado: "Liberado",
  revisar: "Revisar",
  retenido: "Retenido",
};

const colores: Record<Veredicto, string> = {
  liberado: "var(--color-sello-liberado)",
  revisar: "var(--color-sello-revisar)",
  retenido: "var(--color-sello-retenido)",
};

export function VeredictoEtiqueta({
  veredicto,
  size = "normal",
}: {
  veredicto: Veredicto;
  size?: "normal" | "grande";
}) {
  const color = colores[veredicto];
  return (
    <span
      className="inline-flex items-center gap-2 font-mono font-bold uppercase tracking-[0.18em]"
      style={{ color, textShadow: `0 0 10px ${color}` }}
    >
      <span
        aria-hidden="true"
        className={
          size === "grande"
            ? "h-3 w-3 rounded-full border-2 border-current bg-current/15"
            : "h-2.5 w-2.5 rounded-full border-2 border-current"
        }
      />
      <span className={size === "grande" ? "text-xl" : "text-sm"}>
        {etiquetas[veredicto]}
      </span>
    </span>
  );
}