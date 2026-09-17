import type { Etapa, Finding } from "../lib/schemas";
import { colorSeveridad } from "../lib/severidad";

const etiquetaEtapa: Record<Etapa["nombre"], string> = {
  ingesta: "Ingesta y Aislamiento en Cuarentena",
  instrucciones: "Análisis de Instrucciones & Prompts Ocultos",
  unicode: "Detección de Caracteres Invisibles & Homóglifos",
  dependencias: "Verificación de Cadenas de Suministro & Typosquatting",
  secretos: "Escaneo de Claves API & Credenciales Git",
  triage_ia: "Triage con IA Local (Soberanía Tecnológica)",
  veredicto: "Dictamen y Emisión de Veredicto Final",
};

function MarcadorEtapa({ etapa }: { etapa: Etapa }) {
  switch (etapa.estado) {
    case "en_curso":
      return (
        <span
          aria-hidden="true"
          className="relative flex h-3 w-3 items-center justify-center"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
        </span>
      );
    case "lista":
      return (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-bold text-emerald-400">
          ✓
        </span>
      );
    case "error":
      return (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15 border border-rose-500/40 text-[10px] font-bold text-rose-400">
          ✕
        </span>
      );
    default:
      return (
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-full border border-tactico/60 bg-noche/60"
        />
      );
  }
}

export function InspeccionEnCurso({
  objetivo,
  id,
  etapas,
  hallazgos,
}: {
  objetivo: string;
  id: string;
  etapas: Etapa[];
  hallazgos: Finding[];
}) {
  const etapasCompletadas = etapas.filter((e) => e.estado === "lista").length;
  const porcentaje = Math.round((etapasCompletadas / Math.max(etapas.length, 1)) * 100);

  return (
    <section
      aria-labelledby="inspeccion-titulo"
      className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 space-y-6"
    >
      {/* Tarjeta Principal de Inspección en Curso */}
      <div className="rounded-xl border border-tactico/80 bg-panel/90 p-6 sm:p-8 shadow-2xl backdrop-blur space-y-6">
        
        {/* Encabezado Táctico */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-tactico/60 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h1
                id="inspeccion-titulo"
                className="font-mono text-xs font-bold uppercase tracking-widest text-cian"
              >
                INSPECCIÓN DE SEGURIDAD EN CURSO
              </h1>
            </div>
            <p className="font-mono text-lg sm:text-xl font-bold text-texto truncate max-w-2xl">
              {objetivo}
            </p>
          </div>

          <div className="font-mono text-right text-xs text-texto-2 space-y-1">
            <div className="flex items-center gap-2 justify-end">
              <span className="text-texto-2/70">OPERACIÓN ID:</span>
              <span className="bg-noche/80 text-cian px-2 py-0.5 rounded border border-tactico/60 font-bold">
                {id.slice(0, 8)}
              </span>
            </div>
            <p className="text-[11px] text-emerald-400 font-semibold">
              PIPELINE ISOLADO · 100% LOCAL
            </p>
          </div>
        </div>

        {/* Barra de Progreso Elegante */}
        <div className="space-y-2">
          <div className="flex justify-between items-center font-mono text-xs text-texto-2">
            <span>PROGRESO DEL ANÁLISIS DE SEGURIDAD</span>
            <span className="text-cian font-bold">{porcentaje}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-noche/80 border border-tactico/50 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-400 transition-all duration-500 ease-out"
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>

        {/* Grid de Dos Columnas: Timeline de Etapas & Evidencia */}
        <div className="grid gap-8 lg:grid-cols-2 pt-2">
          
          {/* Columna Izquierda: Timeline de Pasos Controlados */}
          <div className="space-y-3">
            <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-texto-2 pb-2 border-b border-tactico/50 flex items-center justify-between">
              <span>CONTROLES PIPELINE</span>
              <span>ETAPAS: {etapasCompletadas}/{etapas.length}</span>
            </h2>

            <ol className="space-y-2 font-mono text-xs">
              {etapas.map((etapa, i) => (
                <li
                  key={etapa.nombre}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                    etapa.estado === "en_curso"
                      ? "border-cian/60 bg-cian/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                      : etapa.estado === "lista"
                        ? "border-tactico/40 bg-panel/60"
                        : "border-transparent opacity-60"
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-[10px] text-texto-2/70 font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <MarcadorEtapa etapa={etapa} />
                  <div className="flex-1 min-w-0">
                    <p className={`truncate text-[12px] ${etapa.estado === "pendiente" ? "text-texto-2" : "text-texto font-medium"}`}>
                      {etiquetaEtapa[etapa.nombre]}
                    </p>
                  </div>
                  {etapa.duracionMs !== undefined && (
                    <span className="text-[10px] text-texto-2/80 bg-noche/60 px-1.5 py-0.5 rounded border border-tactico/30">
                      {etapa.duracionMs}ms
                    </span>
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {etapa.estado === "en_curso" ? (
                      <span className="text-cyan-400">EN CURSO</span>
                    ) : etapa.estado === "lista" ? (
                      <span className="text-emerald-400">OK</span>
                    ) : etapa.estado === "error" ? (
                      <span className="text-rose-400">ERROR</span>
                    ) : (
                      <span className="text-texto-2/50">ESPERA</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Columna Derecha: Evidencia Capturada en Vivo */}
          <div className="space-y-3">
            <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-texto-2 pb-2 border-b border-tactico/50 flex items-center justify-between">
              <span>HALLAZGOS EN TIEMPO REAL</span>
              <span className={hallazgos.length > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>
                {hallazgos.length} DETECTADOS
              </span>
            </h2>

            {hallazgos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-tactico/50 bg-noche/40 p-8 text-center font-mono text-xs text-texto-2 space-y-1">
                <p className="text-texto-2/80 font-semibold">Ejecutando inspección limpia...</p>
                <p className="text-[11px] text-texto-2/60">Los hallazgos se reportarán ordenadamente en caso de detectarse.</p>
              </div>
            ) : (
              <ul className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {hallazgos.map((h) => {
                  const color = colorSeveridad[h.severidad];
                  return (
                    <li
                      key={h.id}
                      className="rounded-lg border border-tactico/60 bg-noche/80 p-3 shadow-md space-y-1 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: `${color}20`,
                            color: color,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          {h.severidad}
                        </span>
                        <span className="text-[10px] text-texto-2 truncate max-w-[200px]">
                          {h.regla}
                        </span>
                      </div>
                      <p className="font-bold text-texto text-[13px] pt-1">{h.titulo}</p>
                      <p className="text-[11px] text-texto-2/80 flex items-center gap-1">
                        <span>📁</span>
                        <span className="truncate">{h.archivo}</span>
                        {h.linea !== undefined && <span className="text-cian font-bold">:{h.linea}</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        </div>

      </div>
    </section>
  );
}