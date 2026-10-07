import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-900.css";
import "./globals.css";
import { PieGobierno } from "@/components/Marca";
export const metadata = { title: "Tablero de datos", description: "Banco de la Gente de Córdoba" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}<PieGobierno /></body></html>;
}
