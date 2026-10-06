import "./globals.css";
export const metadata = { title: "Tablero de datos", description: "Banco de la Gente de Córdoba" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
