import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Scan } from "../lib/schemas";
import { detectarTipoObjetivo, etiquetaTipo } from "../lib/objetivo";
import { Header } from "../components/Header";
import { VeredictoEtiqueta } from "../components/VeredictoEtiqueta";

const totalHallazgos = (scan: Scan): number | null => {
  if (!scan.resumen) return scan.hallazgos.length || null;
  const porSev = Object.values(scan.resumen.porSeveridad);
  return porSev.length > 0 ? porSev.reduce((a, b) => a + b, 0) : null;
};

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function EsqueletoFilas() {
  return (
    <div className="divide-y divide-tactico/60 border border-tactico/60 bg-panel/70 rounded-xl overflow-hidden">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse bg-tactico/20" />
      ))}
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const [objetivo, setObjetivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tipo = useMemo(() => detectarTipoObjetivo(objetivo), [objetivo]);
  const etiqueta = etiquetaTipo(tipo);

  const { data: scans, isLoading, isError } = useQuery({
    queryKey: ["scans"],
    queryFn: api.obtenerScans,
    refetchOnWindowFocus: false,
  });

  const crearScan = useMutation({
    mutationFn: api.crearScan,
    onSuccess: ({ id }) => navigate(`/escaneos/${id}`),
  });

  const inspeccionar = (evento: React.FormEvent) => {
    evento.preventDefault();
    const valor = objetivo.trim();
    if (!valor) {
      setError("Ingresá una URL de repo o un paquete para inspeccionar.");
      return;
    }
    if (tipo === "desconocido") {
      setError(
        "No reconozco ese destino. Usá una URL de repo o un paquete con el prefijo npm: o pypi:."
      );
      return;
    }
    setError(null);
    crearScan.mutate(valor);
  };

  return (
    <div className="min-h-svh bg-noche text-texto flex flex-col font-sans">
      <Header />

      <main className="relative flex-1">
        <div
          aria-hidden="true"
          className="grid-fondo pointer-events-none absolute inset-0 opacity-40"
        />

        <div className="relative mx-auto w-full max-w-5xl px-4 py-12 space-y-12">

          {/* ── ENCABEZADO Y BUSCADOR DE INSPECCIÓN ── */}
          <section className="space-y-8 text-center">
            <div className="space-y-3 max-w-3xl mx-auto">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-texto">
                Inspeccioná lo que entra{" "}
                <span className="text-cian">antes de que toque tu agente.</span>
              </h1>
              <p className="text-texto-2 text-sm sm:text-base leading-relaxed">
                Aduana analiza repositorios y paquetes en busca de instrucciones ocultas, caracteres invisibles, dependencias alucinadas y secretos expuestos. Todo corre localmente en tu infraestructura soberana.
              </p>
            </div>

            {/* Formulario de Ingestion Destacado */}
            <form onSubmit={inspeccionar} className="max-w-3xl mx-auto">
              <div className="rounded-xl border border-tactico/80 bg-panel/90 p-3 sm:p-4 shadow-2xl backdrop-blur space-y-3 text-left">
                <div className="flex items-center justify-between px-1">
                  <label
                    htmlFor="input-objetivo"
                    className="font-mono text-[11px] font-bold uppercase tracking-widest text-cian flex items-center gap-2"
                  >
                    <span className="h-2 w-2 rounded-full bg-cian animate-pulse" />
                    DOCUMENTO O COMPONENTE A INSPECCIONAR
                  </label>
                  <span className="font-mono text-[11px] text-texto-2">
                    AIR-GAPPED CONTROL
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="input-objetivo"
                    type="text"
                    value={objetivo}
                    onChange={(e) => setObjetivo(e.target.value)}
                    placeholder="https://github.com/usuario/repo  o  npm:paquete  o  pypi:paquete"
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 w-full rounded-lg border border-tactico/70 bg-noche/90 px-4 py-3.5 font-mono text-sm sm:text-base text-texto placeholder:text-texto-2/40 focus:border-cian focus:ring-2 focus:ring-cian/20 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={crearScan.isPending}
                    className="shrink-0 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-mono text-sm font-bold uppercase tracking-wider px-8 py-3.5 shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {crearScan.isPending ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>INSPECCIONANDO...</span>
                      </>
                    ) : (
                      <>
                        <span>INSPECCIONAR</span>
                        <span>⚡</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[12px] text-texto-2">
                  <span>
                    {objetivo.trim() === "" ? (
                      "Formatos aceptados: URL de repo GitHub/GitLab o prefijos npm: / pypi:."
                    ) : etiqueta ? (
                      <span>
                        Tipo detectado: <strong className="text-cian">{etiqueta}</strong>
                      </span>
                    ) : (
                      "Usá una URL válida o el prefijo npm: o pypi:."
                    )}
                  </span>
                </div>
              </div>

              {error && (
                <div role="alert" className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 font-mono text-sm text-rose-400 text-left">
                  ⚠️ {error}
                </div>
              )}
            </form>
          </section>

          {/* ── SECCIÓN DE TABLA DE DATOS 'ÚLTIMOS INSPECCIONADOS' A ANCHO COMPLETO ── */}
          <section className="space-y-4 pt-4">
            <div className="flex items-center justify-between border-b border-tactico/60 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-cian">
                  ÚLTIMOS INSPECCIONADOS
                </h2>
                <span className="font-mono text-[10px] bg-tactico/40 text-cian px-2 py-0.5 rounded-full border border-tactico/60">
                  REGISTRO OFICIAL
                </span>
              </div>
              <Link
                to="/historial"
                className="font-mono text-xs text-cian hover:underline underline-offset-4 flex items-center gap-1"
              >
                <span>Ver historial completo</span>
                <span>→</span>
              </Link>
            </div>

            {isLoading ? (
              <EsqueletoFilas />
            ) : isError ? (
              <div className="rounded-xl border border-tactico/60 bg-panel/70 p-6 text-center font-mono text-sm text-texto-2">
                ⚠️ No se pudo conectar con el servidor en <span className="text-cian">127.0.0.1:3000</span>.
              </div>
            ) : scans && scans.length > 0 ? (
              <div className="rounded-xl border border-tactico/60 bg-panel/70 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-noche/60 border-b border-tactico/50 text-texto-2 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th scope="col" className="px-5 py-3.5 font-semibold">Target / Objetivo</th>
                        <th scope="col" className="px-5 py-3.5 font-semibold">Fecha</th>
                        <th scope="col" className="px-5 py-3.5 font-semibold">Status</th>
                        <th scope="col" className="px-5 py-3.5 font-semibold text-right">Findings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tactico/40">
                      {scans.slice(0, 8).map((scan) => {
                        const hallazgos = totalHallazgos(scan);
                        return (
                          <tr
                            key={scan.id}
                            onClick={() => navigate(`/escaneos/${scan.id}`)}
                            className="group cursor-pointer hover:bg-tactico/30 transition-colors"
                          >
                            <td className="px-5 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-texto group-hover:text-cian transition-colors truncate max-w-md">
                                  {scan.objetivo}
                                </span>
                                <span className="text-[10px] text-texto-2/70">
                                  {scan.tipo === "repo" ? "Repository" : "Package"} · ID: {scan.id.slice(0, 8)}
                                </span>
                              </div>
                            </td>

                            <td className="px-5 py-4 text-texto-2 whitespace-nowrap">
                              {formatoFecha.format(new Date(scan.creadoEn))}
                            </td>

                            <td className="px-5 py-4 whitespace-nowrap">
                              {scan.veredicto ? (
                                <VeredictoEtiqueta veredicto={scan.veredicto} />
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-tactico/40 text-texto-2 border border-tactico/60 text-[11px] font-bold uppercase">
                                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                                  {scan.estado === "en_curso" ? "Scanning..." : scan.estado}
                                </span>
                              )}
                            </td>

                            <td className="px-5 py-4 text-right font-bold whitespace-nowrap">
                              {scan.veredicto ? (
                                <span className={hallazgos && hallazgos > 0 ? "text-rose-400" : "text-emerald-400"}>
                                  {hallazgos !== null ? `${hallazgos} issues` : "0 issues"}
                                </span>
                              ) : (
                                <span className="text-texto-2/50">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-tactico/60 bg-panel/40 p-12 text-center font-mono text-sm text-texto-2 space-y-2">
                <p className="text-texto font-bold">No hay inspecciones registradas.</p>
                <p className="text-xs">Ingresá una URL de repositorio o paquete arriba para comenzar el control.</p>
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}