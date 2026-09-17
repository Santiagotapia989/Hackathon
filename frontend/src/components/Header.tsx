import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { EscudoAduana } from "./EscudoAduana";

const enlaceClase = ({ isActive }: { isActive: boolean }) =>
  [
    "border-b-2 px-3 py-2 font-mono text-[13px] uppercase tracking-[0.14em] transition-colors",
    isActive
      ? "border-cian text-cian font-bold"
      : "border-transparent text-texto-2 hover:border-tactico hover:text-texto",
  ].join(" ");

interface HeaderProps {
  timeline?: {
    colapsado: boolean;
    onToggle: () => void;
  };
}

export function Header({ timeline }: HeaderProps) {
  const [tema, setTema] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("tema") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (tema === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("tema", tema);
  }, [tema]);

  const toggleTema = () => {
    setTema((t) => (t === "dark" ? "light" : "dark"));
  };

  return (
    <div className="bg-noche">
      <div className="border-b border-tactico">
        <div className="w-full flex justify-between items-center px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-texto-2">
            SISTEMA ADUANERO DE CONTROL PREVIO DE SOFTWARE · UNDEF / FIE
          </p>
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-cian">
            <span
              aria-hidden="true"
              className="parpadeo h-1.5 w-1.5 rounded-full bg-cian"
            />
            Sistema en línea
          </p>
        </div>
      </div>

      <header className="border-b border-tactico bg-panel/50 backdrop-blur">
        <div className="w-full flex justify-between items-center px-6">
          <NavLink to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo FIE" className="h-12 w-12 rounded-full object-cover bg-white" />
            <span className="h-8 w-px bg-tactico" aria-hidden="true" />
            <span className="flex items-center gap-2.5">
              <EscudoAduana className="h-7 w-7 text-cian" />
              <span className="flex flex-col leading-tight">
                <span className="text-lg font-bold tracking-wide text-texto">
                  Aduana
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-texto-2">
                  Control previo de acceso
                </span>
              </span>
            </span>
          </NavLink>

          <div className="flex items-center gap-4">
            <nav aria-label="Secciones" className="flex items-center">
              <NavLink to="/" className={enlaceClase} end>
                Nuevo escaneo
              </NavLink>
              {timeline ? (
                <button
                  type="button"
                  onClick={timeline.onToggle}
                  className={[
                    "border-b-2 px-3 py-2 font-mono text-[13px] uppercase tracking-[0.14em] transition-colors",
                    !timeline.colapsado
                      ? "border-cian text-cian font-bold"
                      : "border-transparent text-texto-2 hover:border-tactico hover:text-texto",
                  ].join(" ")}
                >
                  {timeline.colapsado ? "▶ Timeline" : "▲ Timeline"}
                </button>
              ) : null}
            </nav>

            <button
              onClick={toggleTema}
              title={tema === "dark" ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
              className="flex h-9 w-9 items-center justify-center rounded border border-tactico bg-panel/60 text-texto hover:bg-tactico/50 focus:outline-none transition-colors"
              aria-label="Toggle theme"
            >
              {tema === "dark" ? (
                <span className="text-base" aria-hidden="true">☀️</span>
              ) : (
                <span className="text-base" aria-hidden="true">🌙</span>
              )}
            </button>
          </div>
        </div>
      </header>
    </div>
  );
}