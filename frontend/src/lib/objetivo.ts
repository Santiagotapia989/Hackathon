export type TipoObjetivo =
  | "repo"
  | "paquete-npm"
  | "paquete-pypi"
  | "desconocido";

const RE_PAQUETE_NPM = /^npm:/i;
const RE_PAQUETE_PYPI = /^pypi:/i;
const RE_URL = /^https?:\/\//i;
const RE_GIT_SUFFIX = /\.git$/i;
const RE_HOST_REPO = /(github\.com|gitlab\.[a-z.]+|bitbucket\.org|codeberg\.org)/i;

export function detectarTipoObjetivo(objetivo: string): TipoObjetivo {
  const valor = objetivo.trim();
  if (!valor) return "desconocido";
  if (RE_PAQUETE_NPM.test(valor)) return "paquete-npm";
  if (RE_PAQUETE_PYPI.test(valor)) return "paquete-pypi";
  if (RE_URL.test(valor) || RE_GIT_SUFFIX.test(valor) || RE_HOST_REPO.test(valor)) {
    return "repo";
  }
  return "desconocido";
}

export function etiquetaTipo(tipo: TipoObjetivo): string | null {
  switch (tipo) {
    case "repo":
      return "Repositorio";
    case "paquete-npm":
      return "Paquete npm";
    case "paquete-pypi":
      return "Paquete PyPI";
    case "desconocido":
      return null;
  }
}