import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Header } from "../components/Header";
import { Reporte } from "../components/Reporte";
import { InspeccionEnCurso } from "../components/InspeccionEnCurso";

export function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

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
    <div className="min-h-svh bg-noche">
      <Header />

      {isLoading ? (
        <section className="mx-auto w-full max-w-6xl px-4 pt-8">
          <div className="panel-cyber clip-esquina p-6">
            <p className="parpadeo font-mono text-xs uppercase tracking-widest text-cian">
              Recuperando informe…
            </p>
          </div>
        </section>
      ) : isError || !scan ? (
        <section className="mx-auto w-full max-w-6xl px-4 pt-8">
          <div className="panel-cyber border border-sello-retenido/60 p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-sello-retenido">
              No se pudo recuperar el escaneo
            </p>
            <p className="mt-2 text-base leading-relaxed text-texto-2">
              El objetivo{" "}
              <span className="font-mono text-cian">{id}</span> no existe o el
              servicio no responde. Verificá que el servidor esté en
              localhost:3000 y volvé a intentar.
            </p>
          </div>
        </section>
      ) : scan.estado === "en_curso" ? (
        <InspeccionEnCurso
          objetivo={scan.objetivo}
          id={scan.id}
          etapas={scan.etapas}
          hallazgos={scan.hallazgos}
        />
      ) : scan.estado === "error" ? (
        <section className="mx-auto w-full max-w-6xl px-4 pt-8">
          <div className="panel-cyber border border-sello-retenido/60 p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-sello-retenido">
              Inspección fallida
            </p>
            <p className="mt-2 text-base leading-relaxed text-texto-2">
              El análisis de{" "}
              <span className="font-mono text-cian">{scan.objetivo}</span> no
              pudo completarse. Revisá que el objetivo sea accesible y volvé a
              intentarlo.
            </p>
          </div>
        </section>
      ) : (
        <Reporte scan={scan} />
      )}
    </div>
  );
}