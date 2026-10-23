import qrcode from "qrcode-generator";
import { LogoMinisterio } from "@/components/Marca";
import { EMISOR_TOTP } from "@/lib/auth2/config";
import { exigirPaso } from "@/lib/auth2/pendiente";
import { secretoLegible, secretoParaAlta } from "@/lib/auth2/flujo";
import { uriOtpauth } from "@/lib/auth2/totp";
import ConfigurarAutenticador from "@/components/ConfigurarAutenticador";

export const dynamic = "force-dynamic";

export default async function Configurar() {
  const { usuario } = await exigirPaso("/login/configurar");
  const secreto = await secretoParaAlta(usuario);
  const qr = qrcode(0, "M");
  qr.addData(uriOtpauth(secreto, usuario.nombre ?? usuario.usuario, EMISOR_TOTP));   // el QR se arma acá, en el servidor: el secreto no pasa por ningún servicio externo
  qr.make();
  return (
    <main className="login">
      <div className="login-marca">
      <LogoMinisterio />
      <ConfigurarAutenticador qrSrc={`data:image/svg+xml;base64,${Buffer.from(qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true })).toString("base64")}`} secreto={secretoLegible(secreto)} />
      <form method="post" action="/api/logout" className="cancelar"><button type="submit">Cancelar y volver</button></form>
      </div>
    </main>
  );
}
