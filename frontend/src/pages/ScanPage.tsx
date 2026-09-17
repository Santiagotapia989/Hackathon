import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Header } from "../components/Header";
import { Reporte } from "../components/Reporte";
import { InspeccionEnCurso } from "../components/InspeccionEnCurso";

export function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [timelineColapsado, setTimelineColapsado] = useState(true);

  const {
    data: scan,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["scan", id],
    queryFn: () => api.obtenerScan(id ?? ""),
    enabled: Boolean(id),
    retry: 1,
  });

  // Auto-scroll suave hacia el reporte una vez terminado el escaneo
  useEffect(() => {
    if (scan?.estado === "terminado") {
      const timer = setTimeout(() => {
        const el = document.getElementById("inicio-reporte");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [scan?.estado]);

  useEffect(() => {
    if (!id || scan?.estado !== "en_curso") return;

    const desuscribir = api.suscribirseScan(id, (evento) => {
      if (evento.tipo === "veredicto") {
        window.setTimeout(() => {
          void refetch();
          void queryClient.invalidateQueries({ queryKey: ["scans"] });
        }, 300);
      } else {
        void refetch();
      }
    });

    const sondeo = window.setInterval(() => {
      void refetch();
    }, 2000);

    return () => {
      desuscribir();
      window.clearInterval(sondeo);
    };
  }, [id, scan?.estado, refetch, queryClient]);

  return (
    <div className="min-h-svh bg-noche text-texto">
      <Header
        timeline={
          scan?.estado === "terminado"
            ? {
                colapsado: timelineColapsado,
                onToggle: () => setTimelineColapsado((prev) => !prev),
              }
            : undefined
        }
      />

      {isLoading ? (
        <section className="mx-auto w-full max-w-6xl px-4 pt-12">
          <div className="rounded-xl border border-tactico/80 bg-panel/90 p-8 shadow-2xl backdrop-blur text-center space-y-3 font-mono">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cian border-t-transparent" />
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-cian">
              RECUPERANDO INFORME DE INSPECCIÓN...
            </p>
          </div>
        </section>
      ) : isError || !scan ? (
        <section className="mx-auto w-full max-w-6xl px-4 pt-12">
          <div className="rounded-xl border border-rose-500/50 bg-panel/90 p-8 shadow-2xl backdrop-blur space-y-2">
            <p className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-rose-400">
              ⚠️ NO SE PUDO RECUPERAR EL ESCANEO
            </p>
            <p className="text-sm text-texto-2">
              El objetivo <span className="font-mono text-cian">{id}</span> no existe o el servicio de backend no responde. Verificá que el servidor esté en <span className="font-mono text-cian">127.0.0.1:3000</span>.
            </p>
          </div>
        </section>
      ) : scan.estado === "en_curso" ? (
        <div className="space-y-4">
          <InspeccionEnCurso
            objetivo={scan.objetivo}
            id={scan.id}
            etapas={scan.etapas}
            hallazgos={scan.hallazgos}
          />
        </div>
      ) : scan.estado === "error" ? (
        <section className="mx-auto w-full max-w-6xl px-4 pt-12">
          <div className="rounded-xl border border-rose-500/50 bg-panel/90 p-8 shadow-2xl backdrop-blur space-y-3 font-mono">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-rose-400">
              ❌ INSPECCIÓN FALLIDA
            </p>
            <p className="text-sm text-texto-2 font-sans">
              El análisis de <span className="font-mono text-cian">{scan.objetivo}</span> no pudo completarse.
            </p>
            {scan.error && (
              <div className="mt-2 rounded bg-noche/80 p-3 border border-rose-500/30 text-xs text-rose-300 font-mono">
                Causa: {scan.error}
              </div>
            )}
          </div>
        </section>
      ) : (
        /* Estado TERMINADO: Renderiza primero el Timeline (colapsable por defecto) y justo debajo el Informe completo con auto-scroll */
        <div className="space-y-6 pb-16">
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 print:hidden">
            <div className="flex items-center justify-between border-b border-tactico/60 pb-3 font-mono text-xs">
              <span className="text-texto-2 uppercase tracking-widest font-bold flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                TIMELINE DEL ANÁLISIS COMPLETADO (COLAPSADO POR DEFECTO)
              </span>
            </div>

            <div
              className={`transition-all duration-500 ease-in-out overflow-hidden ${
                timelineColapsado ? "max-h-0 opacity-0 mt-0" : "max-h-[2000px] opacity-100 mt-4"
              }`}
            >
              <InspeccionEnCurso
                objetivo={scan.objetivo}
                id={scan.id}
                etapas={scan.etapas}
                hallazgos={scan.hallazgos}
              />
            </div>
          </div>

          <div className="border-t border-tactico/60 pt-2 print:border-0 print:pt-0">
            <Reporte scan={scan} />
          </div>
        </div>
      )}
    </div>
  );
}