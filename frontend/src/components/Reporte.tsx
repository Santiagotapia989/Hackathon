import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Finding, Modulo, Scan, Severidad, Veredicto } from "../lib/schemas";
import {
  colorSeveridad,
  etiquetaModulo,
  etiquetaSeveridad,
  ordenModulos,
  ordenSeveridad,
} from "../lib/severidad";
import { formatearDuracion, marcarInvisibles } from "../lib/texto";

const verboVeredicto: Record<Veredicto, string> = {
  liberado: "LIBERADO",
  revisar: "REVISAR",
  retenido: "RETENIDO",
};

const colorVeredicto: Record<Veredicto, string> = {
  liberado: "var(--color-sello-liberado)",
  revisar: "var(--color-sello-revisar)",
  retenido: "var(--color-sello-retenido)",
};

const formatoFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function EtiquetaSeveridad({ severidad }: { severidad: Severidad }) {
  const color = colorSeveridad[severidad];
  return (
    <span
      className="inline-block border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
      style={{
        color,
        borderColor: `${color}66`,
        backgroundColor: `${color}14`,
        textShadow: `0 0 8px ${color}66`,
      }}
    >
      {etiquetaSeveridad[severidad]}
    </span>
  );
}

function SelloVeredicto({ scan }: { scan: Scan }) {
  const veredicto: Veredicto = scan.veredicto ?? "revisar";
  const color = colorVeredicto[veredicto];
  return (
    <div className="sello-entrada grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-texto-2">
          Reporte de inspección
        </p>
        <h1 className="mt-1 truncate font-mono text-xl font-bold text-texto">
          {scan.objetivo}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-texto-2">
          <span>OPS: <span className="text-texto">{scan.id}</span></span>
          <span>
            INICIO: <span className="text-texto">{formatoFecha.format(new Date(scan.creadoEn))}</span>
          </span>
          <span>
            DURACIÓN: <span className="text-texto">{formatearDuracion(scan.duracionMs)}</span>
          </span>
          <span>
            TIPO: <span className="text-texto">{scan.tipo === "repo" ? "REPO" : "PAQUETE"}</span>
          </span>
        </div>
      </div>

      <div
        className="clip-esquina flex items-center gap-4 border-2 px-6 py-4"
        style={{ borderColor: color, boxShadow: `0 0 24px ${color}40, inset 0 0 20px ${color}14` }}
        role="status"
      >
        <span
          aria-hidden="true"
          className="parpadeo h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}` }}
        />
        <span className="flex flex-col">
          <span
            className="font-mono text-3xl font-bold uppercase tracking-[0.08em]"
            style={{ color, textShadow: `0 0 14px ${color}` }}
          >
            {verboVeredicto[veredicto]}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-texto-2">
            Sello de veredicto
          </span>
        </span>
      </div>
    </div>
  );
}

function InformeEjecutivoC4ISR({ scan }: { scan: Scan }) {
  const informe = scan.informeEjecutivo;
  if (!informe) return null;
  return (
    <section
      aria-labelledby="informe-c4isr"
      className="panel-cyber brillo-cian-borde clip-esquina relative mt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cian/30 bg-cian/5 px-4 py-2.5">
        <h2
          id="informe-c4isr"
          className="font-mono text-[12px] font-bold uppercase tracking-[0.24em] text-cian [text-shadow:0_0_10px_currentColor]"
        >
          Informe Ejecutivo C4ISR
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-texto-2">
          Comando Superior · Estado Mayor Conjunto
        </span>
      </div>

      <dl className="divide-y divide-tactico">
        <div className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-cian/80">
            Desafío detectado
          </dt>
          <dd className="text-[15px] leading-snug text-texto">{informe.desafioDetectado}</dd>
        </div>
        <div className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-cian/80">
            Objetivo del repo
          </dt>
          <dd className="text-[15px] leading-snug text-texto">{informe.objetivoRepo}</dd>
        </div>
        <div className="grid gap-2 px-4 py-3 sm:grid-cols-[220px_1fr]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-cian/80">
            Métricas proyectadas
          </dt>
          <dd className="flex flex-wrap gap-2">
            {informe.metricasImpacto.map((metrica) => (
              <span
                key={metrica}
                className="border border-cian/40 bg-noche/60 px-3 py-1.5 font-mono text-[13px] text-cian [text-shadow:0_0_8px_currentColor]"
              >
                {metrica}
              </span>
            ))}
          </dd>
        </div>
        <div className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-cian/80">
            Fase de ejecución
          </dt>
          <dd className="text-[15px] leading-snug text-texto">{informe.faseEjecucion}</dd>
        </div>
      </dl>
    </section>
  );
}

function Resumen({ scan }: { scan: Scan }) {
  const resumen = scan.resumen;
  if (!resumen) return null;
  const total = Object.values(resumen.porSeveridad).reduce((a, b) => a + b, 0);
  return (
    <section aria-labelledby="resumen-titulo" className="mt-6">
      <h2
        id="resumen-titulo"
        className="mb-3 font-mono text-[12px] font-bold uppercase tracking-[0.24em] text-texto-2"
      >
        Resumen operacional · {total} hallazgo{total === 1 ? "" : "s"}
      </h2>
      <div className="grid grid-cols-2 gap-px border border-tactico bg-tactico lg:grid-cols-4">
        {ordenSeveridad.map((sev) => (
          <div key={sev} className="bg-panel px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-texto-2">
              {etiquetaSeveridad[sev]}
            </p>
            <p
              className="mt-1 font-mono text-3xl font-bold"
              style={{
                color: colorSeveridad[sev],
                textShadow: `0 0 12px ${colorSeveridad[sev]}66`,
              }}
            >
              {resumen.porSeveridad[sev] ?? 0}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {ordenModulos.map((mod) => (
          <span
            key={mod}
            className="border border-tactico bg-panel px-3 py-1 font-mono text-[12px] text-texto-2"
          >
            {etiquetaModulo[mod]}:{" "}
            <span className="font-bold text-texto">{resumen.porModulo[mod] ?? 0}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function RayosX({ hallazgo }: { hallazgo: Finding }) {
  if (hallazgo.modulo !== "unicode" || !hallazgo.evidenciaDecodificada) return null;
  const color = colorSeveridad[hallazgo.severidad];
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="border border-tactico bg-[#060A14] p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-texto-2">
          Lo que ves
        </p>
        <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-texto-2">
          {marcarInvisibles(hallazgo.evidencia)}
        </pre>
      </div>
      <div
        className="border bg-[#060A14] p-3"
        style={{ borderColor: `${color}55` }}
      >
        <p
          className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color }}
        >
          Lo que lee la IA
        </p>
        <pre
          className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed"
          style={{ color, textShadow: `0 0 8px ${color}44` }}
        >
          {marcarInvisibles(hallazgo.evidenciaDecodificada)}
        </pre>
      </div>
    </div>
  );
}

function HallazgoItem({ hallazgo }: { hallazgo: Finding }) {
  const color = colorSeveridad[hallazgo.severidad];
  return (
    <article className="panel-cyber p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <EtiquetaSeveridad severidad={hallazgo.severidad} />
            <span
              className="border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-texto-2"
              style={{ borderColor: `${color}33`, backgroundColor: `${color}0D` }}
            >
              {etiquetaModulo[hallazgo.modulo]}
            </span>
            {hallazgo.determinista ? (
              <span className="border border-cian/40 bg-cian/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cian [text-shadow:0_0_8px_currentColor]">
                Confirmado por reglas
              </span>
            ) : (
              <span className="border border-ele/50 bg-ele/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ele">
                Evaluado por IA
                {hallazgo.analisisIA
                  ? ` · ${Math.round(hallazgo.analisisIA.confianza * 100)}%`
                  : ""}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-lg font-bold leading-snug text-texto">
            {hallazgo.titulo}
          </h3>
        </div>
      </div>

      <p className="mt-2 font-mono text-[12px] text-texto-2">
        {hallazgo.regla}
        {" · "}
        <span className="text-texto">{hallazgo.archivo}</span>
        {hallazgo.linea !== undefined ? `:${hallazgo.linea}` : ""}
        {hallazgo.commit ? ` · commit ${hallazgo.commit}` : ""}
      </p>

      {hallazgo.analisisIA?.intentoManipulacion ? (
        <p
          className="mt-3 border px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{
            color,
            borderColor: `${color}55`,
            backgroundColor: `${color}12`,
            textShadow: `0 0 8px ${color}66`,
          }}
        >
          ► Este archivo intentó engañar al analizador. El veredicto no cambió.
        </p>
      ) : null}

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-texto-2">
        Evidencia
      </p>
      <pre className="mt-1 overflow-auto whitespace-pre-wrap break-all border border-tactico bg-noche p-3 font-mono text-[12px] leading-relaxed text-texto">
        {marcarInvisibles(hallazgo.evidencia)}
      </pre>

      <RayosX hallazgo={hallazgo} />

      {hallazgo.explicacion ? (
        <p className="mt-3 text-sm leading-relaxed text-texto-2">
          {hallazgo.explicacion}
        </p>
      ) : null}

      {hallazgo.remediacion?.length ? (
        <div className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-texto-2">
            Remediación
          </p>
          <ol className="mt-1 grid gap-1">
            {hallazgo.remediacion.map((paso, i) => (
              <li
                key={paso}
                className="flex gap-2 font-mono text-[13px] text-texto"
              >
                <span className="text-cian/80">{i + 1}.</span>
                <span>{paso}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

export function Reporte({ scan }: { scan: Scan }) {
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState<string | null>(null);

  const agrupados = useMemo(
    () =>
      ordenModulos
        .map((mod: Modulo) => ({
          modulo: mod,
          items: scan.hallazgos
            .filter((h) => h.modulo === mod)
            .sort(
              (a, b) =>
                ordenSeveridad.indexOf(a.severidad) -
                ordenSeveridad.indexOf(b.severidad)
            ),
        }))
        .filter((g) => g.items.length > 0),
    [scan.hallazgos]
  );

  const copiarReporte = async () => {
    setErrorCopia(null);
    try {
      await navigator.clipboard.writeText(JSON.stringify(scan, null, 2));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErrorCopia("No se pudo copiar al portapapeles.");
      setTimeout(() => setErrorCopia(null), 3000);
    }
  };

  return (
    <section aria-labelledby="reporte-titulo" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8">
      <SelloVeredicto scan={scan} />
      <InformeEjecutivoC4ISR scan={scan} />
      <Resumen scan={scan} />

      <section aria-labelledby="hallazgos-titulo" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="hallazgos-titulo"
            className="font-mono text-[12px] font-bold uppercase tracking-[0.24em] text-texto-2"
          >
            Hallazgos por módulo
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copiarReporte}
              className="border border-cian/60 bg-cian/10 px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-cian [text-shadow:0_0_10px_currentColor] hover:bg-cian hover:text-noche hover:[text-shadow:none]"
            >
              {copiado ? "Copiado ✓" : "Copiar reporte JSON"}
            </button>
            <Link
              to="/"
              className="border border-tactico bg-panel px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-texto hover:border-cian/50 hover:text-cian"
            >
              Volver a inspeccionar
            </Link>
          </div>
        </div>

        {errorCopia ? (
          <p
            role="alert"
            className="mb-3 border border-sello-retenido bg-sello-retenido/10 px-3 py-2 font-mono text-[12px] text-sello-retenido"
          >
            {errorCopia}
          </p>
        ) : null}

        {agrupados.length === 0 ? (
          <div className="panel-cyber border border-tactico px-4 py-10 text-center">
            <p className="text-base text-texto">Sin hallazgos.</p>
            <p className="mt-1 text-sm text-texto-2">
              Este objetivo pasa la inspección sin observaciones.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {agrupados.map((grupo) => (
              <section key={grupo.modulo} aria-label={etiquetaModulo[grupo.modulo]}>
                <h3 className="border-b border-tactico pb-2 font-mono text-[12px] font-bold uppercase tracking-[0.24em] text-cian [text-shadow:0_0_10px_currentColor]">
                  {etiquetaModulo[grupo.modulo]}
                </h3>
                <div className="mt-3 grid gap-3">
                  {grupo.items.map((hallazgo) => (
                    <HallazgoItem key={hallazgo.id} hallazgo={hallazgo} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}