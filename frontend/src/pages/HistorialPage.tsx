import { Header } from "../components/Header";
import { PaginaEnConstruccion } from "../components/PaginaEnConstruccion";

export function HistorialPage() {
  return (
    <div className="min-h-svh bg-noche">
      <Header />
      <PaginaEnConstruccion
        titulo="Historial de inspecciones"
        descripcion="Acá vas a ver todas las inspecciones realizadas con filtros por veredicto."
      />
    </div>
  );
}