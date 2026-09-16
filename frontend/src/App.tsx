import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HomePage } from "./pages/HomePage";
import { ScanPage } from "./pages/ScanPage";
import { HistorialPage } from "./pages/HistorialPage";
import { AgentePage } from "./pages/AgentePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/escaneos/:id" element={<ScanPage />} />
          <Route path="/historial" element={<HistorialPage />} />
          <Route path="/agente" element={<AgentePage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}