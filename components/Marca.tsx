import logoBanco from "@/assets/marca/banco-de-la-gente.png";
import logoCmc from "@/assets/marca/cba-me-capacita.png";
import logoMin from "@/assets/marca/ministerio-desarrollo-social.png";
import logoGobierno from "@/assets/marca/cordoba-gobierno-hacer-para-crecer.png";

/* Marcas institucionales. Los archivos están en assets/marca/ (se sirven desde /_next/static,
   por eso también se ven en el login) y se muestran sin deformar: solo se fija el alto. */

export function LogoBanco() {
  return (
    <img className="logo-banco" src={logoBanco.src} width={logoBanco.width} height={logoBanco.height}
      alt="Banco de la Gente. Aquí su palabra vale oro" />
  );
}

export function LogoCmc() {
  return <img className="logo-cmc" src={logoCmc.src} width={logoCmc.width} height={logoCmc.height} alt="Córdoba me capacita" />;
}

/* Marca general del Ministerio: login e inicio. */
export function LogoMinisterio() {
  return (
    <img className="logo-min" src={logoMin.src} width={logoMin.width} height={logoMin.height}
      alt="Ministerio de Desarrollo Social y Promoción del Empleo. Córdoba, Gobierno de la Provincia. Hacer para crecer" />
  );
}

/* Pie de Gobierno + marca de cierre (versión horizontal a color). */
export function PieGobierno() {
  return (
    <footer className="pie-gob">
      <div className="wrap">
        <img className="logo-gob" src={logoGobierno.src} width={logoGobierno.width} height={logoGobierno.height}
          alt="Córdoba, Gobierno de la Provincia. Hacer para crecer" />
        <p>MINISTERIO DE DESARROLLO SOCIAL Y PROMOCIÓN DEL EMPLEO</p>
      </div>
    </footer>
  );
}

/* Cabecera y pie de cada hoja impresa de las fichas (solo se ven al imprimir; ver .hoja-cab y .hoja-pie en globals.css). */
export function CabeceraHoja({ actualizado }: { actualizado: string }) {
  return (
    <div className="hoja-cab">
      <div className="franja" />
      <div className="hoja-cab-fila">
        <LogoBanco />
        <div><b>Banco de la Gente</b><span>Créditos aprobados pendientes de entrega · datos actualizados el {actualizado}</span></div>
      </div>
    </div>
  );
}

export function PieHoja() {
  return (
    <div className="hoja-pie">
      <img src={logoGobierno.src} width={logoGobierno.width} height={logoGobierno.height}
        alt="Córdoba, Gobierno de la Provincia. Hacer para crecer" />
      <span>MINISTERIO DE DESARROLLO SOCIAL Y PROMOCIÓN DEL EMPLEO</span>
    </div>
  );
}
