import { NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { EscudoAduana } from "./EscudoAduana";

const CLAVE_TEMA = "tema-aduana";

const enlaceClase = ({ isActive }: { isActive: boolean }) =>
  [
    "border-b-2 px-3 py-2 font-mono text-sm uppercase tracking-widest transition-colors",
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

function IconoPerfil() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

export function Header({ timeline }: HeaderProps) {
  const [tema, setTema] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(CLAVE_TEMA) || "light";
    }
    return "light";
  });
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [opcionesAbiertas, setOpcionesAbiertas] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (tema === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem(CLAVE_TEMA, tema);
  }, [tema]);

  useEffect(() => {
    if (!menuAbierto) return;

    const cerrarAlClickAfuera = (evento: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(evento.target as Node)) {
        setMenuAbierto(false);
        setOpcionesAbiertas(false);
      }
    };
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setMenuAbierto(false);
        setOpcionesAbiertas(false);
      }
    };

    document.addEventListener("mousedown", cerrarAlClickAfuera);
    document.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.removeEventListener("mousedown", cerrarAlClickAfuera);
      document.removeEventListener("keydown", cerrarConEscape);
    };
  }, [menuAbierto]);

  const opcionClase =
    "w-full px-4 py-2.5 text-left font-mono text-xs uppercase tracking-widest text-texto hover:bg-tactico/40 transition-colors flex items-center justify-between gap-2";

  return (
    <div className="bg-noche print:hidden">
      {/* relative z-50: backdrop-blur crea un stacking context propio, así que
          el z-50 del dropdown queda atrapado dentro del header y el contenido
          de la página (que viene después en el DOM) se pinta por encima del
          menú — en la home el panel del formulario lo tapa por completo. */}
      <header className="relative z-50 border-b border-tactico bg-panel/50 backdrop-blur">
        <div className="w-full flex justify-between items-center px-6 py-5">
          <NavLink to="/" className="flex items-center gap-4">
            <img src="/logo.png" alt="Logo FIE" className="h-16 w-16 rounded-full object-cover bg-white" />
            <span className="h-10 w-px bg-tactico" aria-hidden="true" />
            <span className="flex items-center gap-2.5">
              <EscudoAduana className="h-8 w-8 text-cian" />
              <span className="flex flex-col leading-tight">
                <span className="text-2xl font-bold tracking-wide text-texto">
                  SIAR
                </span>
                <span className="font-mono text-xs uppercase tracking-widest text-texto-2">
                  Sistema de Inspección de Archivos y Repositorios
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
                    "border-b-2 px-3 py-2 font-mono text-sm uppercase tracking-[0.14em] transition-colors",
                    !timeline.colapsado
                      ? "border-cian text-cian font-bold"
                      : "border-transparent text-texto-2 hover:border-tactico hover:text-texto",
                  ].join(" ")}
                >
                  {timeline.colapsado ? "▶ Timeline" : "▲ Timeline"}
                </button>
              ) : null}
            </nav>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuAbierto((v) => !v)}
                title="Perfil de usuario"
                aria-haspopup="menu"
                aria-expanded={menuAbierto}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-tactico bg-panel/60 text-texto hover:bg-tactico/50 focus:outline-none transition-colors"
              >
                <IconoPerfil />
              </button>

              {menuAbierto ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-md border border-tactico bg-panel shadow-2xl"
                >
                  <div className="border-b border-tactico/60 px-4 py-3">
                    <p className="font-sans text-sm font-bold text-texto">
                      Usuario SIVAR
                    </p>
                    <p className="font-mono text-[11px] text-texto-2">
                      operador@fie.undef
                    </p>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    className={opcionClase}
                    onClick={() => setMenuAbierto(false)}
                  >
                    <span>Edición del sistema</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={opcionesAbiertas}
                    className={opcionClase}
                    onClick={() => setOpcionesAbiertas((v) => !v)}
                  >
                    <span>Opciones</span>
                    <span aria-hidden="true" className="text-texto-2">
                      {opcionesAbiertas ? "▾" : "▸"}
                    </span>
                  </button>

                  {opcionesAbiertas ? (
                    <div className="border-t border-tactico/60 px-4 py-3 space-y-2">
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-texto-2">
                        Tema del sistema
                      </p>
                      <div className="grid grid-cols-2 gap-1 rounded border border-tactico bg-noche/60 p-1">
                        <button
                          type="button"
                          onClick={() => setTema("light")}
                          className={[
                            "rounded px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors",
                            tema === "light"
                              ? "bg-cian/20 text-cian border border-cian/50"
                              : "text-texto-2 hover:text-texto border border-transparent",
                          ].join(" ")}
                        >
                          Claro
                        </button>
                        <button
                          type="button"
                          onClick={() => setTema("dark")}
                          className={[
                            "rounded px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors",
                            tema === "dark"
                              ? "bg-cian/20 text-cian border border-cian/50"
                              : "text-texto-2 hover:text-texto border border-transparent",
                          ].join(" ")}
                        >
                          Oscuro
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
