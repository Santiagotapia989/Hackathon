import { Header } from "../components/Header";
import { PaginaEnConstruccion } from "../components/PaginaEnConstruccion";

export function AgentePage() {
  return (
    <div className="min-h-svh bg-noche">
      <Header />
      <PaginaEnConstruccion
        titulo="Actividad del agente"
        descripcion="Acá vas a ver en vivo qué pide tu agente de código y si Aduana lo permite."
      />
    </div>
  );
}