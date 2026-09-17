import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/800.css";
import "./index.css";
import { App } from "./App";

// Inicializar el tema de forma inmediata
const temaGuardado = localStorage.getItem("tema") || "dark";
if (temaGuardado === "light") {
  document.documentElement.classList.add("light");
} else {
  document.documentElement.classList.remove("light");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);