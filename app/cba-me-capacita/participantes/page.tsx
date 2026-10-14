import PaginaNominal from "../_vistaNominal";

export const metadata = { title: "Córdoba me capacita – Participantes" };
export const dynamic = "force-dynamic";

export default function Pagina({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PaginaNominal tipo="participantes" searchParams={searchParams} />;
}
