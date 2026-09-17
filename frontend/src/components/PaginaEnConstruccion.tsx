import { Link } from "react-router-dom";

export function PaginaEnConstruccion({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16">
      <div className="panel-cyber brillo-cian-borde clip-esquina px-6 py-8">
        <p className="font-mono text-xs uppercase tracking-widest text-cian">
          Aduana · Control previo de acceso
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-texto md:text-4xl">{titulo}</h1>
        <p className="mt-2 text-base leading-relaxed text-texto-2">{descripcion}</p>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-texto-2">
          Esta pantalla se habilita en la siguiente etapa de construcción.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block border border-cian/60 bg-cian/10 px-5 py-2.5 font-mono text-sm font-bold uppercase tracking-widest text-cian hover:bg-cian hover:text-white rounded transition-colors"
        >
          Volver al control
        </Link>
      </div>
    </section>
  );
}