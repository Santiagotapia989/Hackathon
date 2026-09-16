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

const MODULOS = [
  "Instrucciones ocultas",
  "Caracteres invisibles",
  "Dependencias alucinadas",
  "Secretos expuestos",
];

function EsqueletoFilas() {
  return (
    <div className="divide-y divide-tactico border border-tactico bg-panel">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse bg-tactico/20" />
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

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.obtenerHealth,
    refetchInterval: 30000,
    retry: 1,
  });

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
    <div className="min-h-svh bg-noche">
      <Header />
      <main className="relative">
        <div
          aria-hidden="true"
          className="grid-fondo pointer-events-none absolute inset-0"
        />

        <div className="relative mx-auto w-full max-w-6xl px-4">
          <section
            aria-labelledby="titulo-control"
            className="flex flex-col items-center pb-12 pt-14 sm:pt-20"
          >
            <h1
              id="titulo-control"
              className="aparecer max-w-4xl text-center text-[34px] font-bold leading-tight text-texto sm:text-[44px]"
              style={{ animationDelay: "0.1s" }}
            >
              Inspeccioná lo que entra{" "}
              <span className="text-cian font-extrabold">
                antes de que toque tu agente.
              </span>
            </h1>
            <p
              className="aparecer mt-4 max-w-2xl text-center text-base leading-relaxed text-texto-2 sm:text-xl"
              style={{ animationDelay: "0.2s" }}
            >
              Aduana analiza repositorios y paquetes en busca de instrucciones
              ocultas, caracteres invisibles, dependencias alucinadas y
              secretos expuestos. Todo corre en tu máquina.
            </p>

            <div
              className="aparecer mt-6 flex flex-wrap items-center justify-center gap-2"
              style={{ animationDelay: "0.3s" }}
            >
              {MODULOS.map((item) => (
                <span
                  key={item}
                  className="border border-tactico bg-panel/60 px-3 py-1 font-mono text-[12px] text-texto-2"
                >
                  <span className="mr-1.5 text-cian">▸</span>
                  {item}
                </span>
              ))}
            </div>

            <form
              onSubmit={inspeccionar}
              className="aparecer mt-10 w-full max-w-2xl"
              aria-label="Nuevo escaneo"
              style={{ animationDelay: "0.4s" }}
            >
              <div className="panel-cyber brillo-cian-borde">
                <div className="flex items-center justify-between border-b border-tactico px-4 py-2.5">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-cian">
                    Documento a inspeccionar
                  </span>
                  <span className="font-mono text-[11px] text-texto-2">
                    S-16 / ENTRADA
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:gap-3 sm:p-4">
                  <input
                    id="objetivo"
                    type="text"
                    value={objetivo}
                    onChange={(e) => setObjetivo(e.target.value)}
                    placeholder="https://git.mil.ar/usuario/repo  o  npm:paquete"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="pista-tipo"
                    className="w-full flex-1 border border-tactico bg-noche/70 px-3 py-3 font-mono text-base text-texto placeholder:text-texto-2/50 focus:border-cian/60 focus:outline-none focus:ring-2 focus:ring-cian/20"
                  />
                  <button
                    type="submit"
                    disabled={crearScan.isPending}
                    className="shrink-0 rounded bg-ele px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-ele/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ele disabled:opacity-60 shadow-sm"
                  >
                    {crearScan.isPending ? "Inspeccionando…" : "Inspeccionar"}
                  </button>
                </div>
                <p
                  id="pista-tipo"
                  className="px-4 pb-3 font-mono text-[13px] text-texto-2"
                  aria-live="polite"
                >
                  {objetivo.trim() === "" ? (
                    "Detecto el tipo automáticamente: repo o paquete."
                  ) : etiqueta ? (
                    <>
                      Tipo detectado:{" "}
                      <span className="font-bold text-cian">{etiqueta}</span>
                    </>
                  ) : (
                    "Un repo es una URL; un paquete usa el prefijo npm: o pypi:."
                  )}
                </p>
              </div>
              {error ? (
                <p
                  role="alert"
                  className="mt-3 border border-sello-retenido/60 bg-sello-retenido/10 px-3 py-2 font-mono text-sm text-sello-retenido rounded"
                >
                  {error}
                </p>
              ) : null}
            </form>

            {health ? (
              <dl
                className="aparecer mt-10 grid w-full max-w-2xl grid-cols-1 divide-y divide-tactico border border-tactico bg-panel/60 rounded lg:grid-cols-3 lg:divide-x lg:divide-y-0"
                style={{ animationDelay: "0.5s" }}
              >
                {[
                  {
                    label: "IA local",
                    ok: health.ollama.activo,
                    texto: health.ollama.activo
                      ? `Activa · ${health.ollama.modelo ?? "modelo local"}`
                      : "Sin conexión, análisis sin explicaciones",
                  },
                  {
                    label: "Gitleaks",
                    ok: health.gitleaks,
                    texto: health.gitleaks
                      ? "Disponible"
                      : "No disponible, faltan secretos",
                  },
                  {
                    label: "Modo",
                    ok: true,
                    texto: health.offline ? "100% en tu máquina" : "Requiere red",
                  },
                ].map((item) => (
                  <div key={item.label} className="px-4 py-3">
                    <dt className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-texto-2">
                      {item.label}
                    </dt>
                    <dd
                      className={`mt-1 flex items-center gap-2 text-sm font-medium ${
                        item.ok ? "text-sello-liberado" : "text-sello-revisar"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${
                          item.ok ? "bg-sello-liberado" : "bg-sello-revisar"
                        }`}
                      />
                      {item.texto}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <section
            aria-labelledby="titulo-historial"
            className="border-t border-tactico pb-16 pt-8"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2
                id="titulo-historial"
                className="font-mono text-[12px] font-bold uppercase tracking-[0.24em] text-texto-2"
              >
                Últimos inspeccionados
              </h2>
              <Link
                to="/historial"
                className="font-mono text-[12px] text-cian underline underline-offset-4 hover:text-sello-liberado"
              >
                Ver historial completo
              </Link>
            </div>

            {isLoading ? (
              <EsqueletoFilas />
            ) : isError ? (
              <p className="border border-tactico bg-panel px-4 py-4 text-sm text-texto-2">
                No se pudo cargar el historial. Revisá que el servidor esté en{" "}
                <span className="font-mono text-cian">localhost:3000</span>.
              </p>
            ) : scans && scans.length > 0 ? (
              <ul className="divide-y divide-tactico border border-tactico bg-panel">
                {scans.slice(0, 5).map((scan) => (
                  <li key={scan.id}>
                    <Link
                      to={`/escaneos/${scan.id}`}
                      className="grid grid-cols-1 items-center gap-1 px-4 py-3 transition-colors hover:bg-tactico/40 lg:grid-cols-[1fr_auto_auto_auto] lg:gap-4"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono text-sm text-texto">
                          {scan.objetivo}
                        </span>
                        <span className="text-[12px] text-texto-2">
                          {scan.tipo === "repo" ? "Repo" : "Paquete"} ·{" "}
                          <span className="font-mono">{scan.id}</span>
                        </span>
                      </span>
                      <span className="font-mono text-[12px] text-texto-2 lg:text-right">
                        {scan.veredicto
                          ? totalHallazgos(scan) !== null
                            ? `${totalHallazgos(scan)} hallazgos`
                            : ""
                          : scan.estado === "en_curso"
                            ? "En inspección…"
                            : "—"}
                      </span>
                      <span className="font-mono text-[12px] text-texto-2 lg:text-right">
                        {formatoFecha.format(new Date(scan.creadoEn))}
                      </span>
                      <span className="justify-self-start lg:justify-self-end lg:w-28">
                        {scan.veredicto ? (
                          <VeredictoEtiqueta veredicto={scan.veredicto} />
                        ) : (
                          <span className="font-mono text-sm font-bold uppercase tracking-wider text-texto-2">
                            {scan.estado === "en_curso" ? "En curso" : "Otros"}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border border-dashed border-tactico bg-panel/40 px-4 py-10 text-center">
                <p className="text-base text-texto">
                  Todavía no se inspeccionó nada.
                </p>
                <p className="mt-1 text-sm text-texto-2">
                  Ingresá una URL de repo o un paquete arriba y comenzá el
                  control.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}