import type { Etapa, Finding } from "../lib/schemas";
import { colorSeveridad } from "../lib/severidad";

const etiquetaEtapa: Record<Etapa["nombre"], string> = {
  ingesta: "Ingesta del repositorio",
  instrucciones: "Análisis de instrucciones",
  unicode: "Detección de unicode oculto",
  dependencias: "Verificación de dependencias",
  secretos: "Escaneo de secretos",
  triage_ia: "Triage con IA local",
  veredicto: "Veredicto final",
};

function MarcadorEtapa({ etapa }: { etapa: Etapa }) {
  switch (etapa.estado) {
    case "en_curso":
      return (
        <span
          aria-hidden="true"
          className="parpadeo inline-block h-2.5 w-2.5 rounded-full bg-cian"
        />
      );
    case "lista":
      return (
        <span className="inline-flex h-5 w-5 items-center justify-center font-mono text-[12px] font-bold text-sello-liberado">
          ✓
        </span>
      );
    case "error":
      return (
        <span className="inline-flex h-5 w-5 items-center justify-center font-mono text-[12px] font-bold text-sello-retenido">
          ×
        </span>
      );
    default:
      return (
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full border border-tactico"
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
  return (
    <section
      aria-labelledby="inspeccion-titulo"
      className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8"
    >
      <div className="panel-cyber brillo-cian-borde barra-escaneo clip-esquina p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1
            id="inspeccion-titulo"
            className="font-mono text-sm font-bold uppercase tracking-[0.24em] text-cian"
          >
            Inspección en curso
          </h1>
          <span className="font-mono text-[11px] text-texto-2">
            OPS: {id}
          </span>
        </div>
        <p className="mt-2 truncate font-mono text-lg font-bold text-texto">
          {objetivo}
        </p>
        <p className="mt-1 flex items-center gap-2 font-mono text-[12px] text-texto-2">
          <span className="parpadeo h-1.5 w-1.5 rounded-full bg-cian" />
          Ejecutando controles del pipeline · los hallazgos aparecen en vivo
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <ol className="grid gap-1">
            {etapas.map((etapa, i) => (
              <li
                key={etapa.nombre}
                className={`flex items-center gap-3 border px-2 py-2 transition-colors rounded ${
                  etapa.estado === "en_curso"
                    ? "border-cian/40 bg-cian/10"
                    : "border-transparent"
                }`}
              >
                <span className="w-6 shrink-0 text-center font-mono text-[11px] text-texto-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <MarcadorEtapa etapa={etapa} />
                <span className="flex-1">
                  <span
                    className={
                      etapa.estado === "pendiente"
                        ? "text-texto-2"
                        : "text-texto"
                    }
                  >
                    {etiquetaEtapa[etapa.nombre]}
                  </span>
                  {etapa.duracionMs !== undefined ? (
                    <span className="ml-2 font-mono text-[11px] text-texto-2">
                      {etapa.duracionMs}ms
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
                  {etapa.estado === "en_curso" ? (
                    <span className="parpadeo text-cian">
                      En curso
                    </span>
                  ) : etapa.estado === "lista" ? (
                    <span className="text-sello-liberado">Listo</span>
                  ) : etapa.estado === "error" ? (
                    <span className="text-sello-retenido">Error</span>
                  ) : (
                    <span className="text-texto-2">Pendiente</span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          <div>
            <h2 className="border-b border-tactico pb-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-texto-2">
              Evidencia en vivo · {hallazgos.length}
            </h2>
            {hallazgos.length === 0 ? (
              <p className="mt-3 font-mono text-[12px] text-texto-2">
                Capturando evidencia…
              </p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {hallazgos.map((h) => {
                  const color = colorSeveridad[h.severidad];
                  return (
                    <li
                      key={h.id}
                      className="border border-tactico bg-noche/60 p-3 rounded"
                    >
                      <p className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: color,
                          }}
                        />
                        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color }}>
                          {h.severidad}
                        </span>
                        <span className="text-[13px] font-bold text-texto">
                          {h.titulo}
                        </span>
                      </p>
                      <p className="mt-1 pl-4 font-mono text-[11px] text-texto-2">
                        {h.archivo}
                        {h.linea !== undefined ? `:${h.linea}` : ""}
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