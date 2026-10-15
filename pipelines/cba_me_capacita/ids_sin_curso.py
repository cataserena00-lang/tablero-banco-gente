"""TEMPORAL: ID de curso que están en ASECOR pero no en REPORTE CURSOS. Solo IDs y cantidades (sin datos personales)."""
import os
import re
import sys
import tempfile
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import procesar_cmc as pc  # noqa: E402


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        c, a = pc.descargar(os.environ["CBA_DRIVE_CARPETA_ID"], Path(tmp))
        dfc, dfa = pc.leer(c), pc.leer(a)
    print("columnas ASECOR:", list(dfa.columns))
    dfa = dfa.assign(_id=pd.to_numeric(dfa["ID Curso"], errors="coerce"))
    ids_cursos = set(pd.to_numeric(dfc["ID Curso"], errors="coerce").dropna().astype(int))
    cur, *_ = pc.cursos_validos(dfc)
    ids_usados = set(cur["id"])
    sin_id = int(dfa["_id"].isna().sum())
    d = dfa.dropna(subset=["_id"]).copy()
    d["_id"] = d["_id"].astype(int)
    faltan = d[~d["_id"].isin(ids_cursos)]
    excl = d[d["_id"].isin(ids_cursos) & ~d["_id"].isin(ids_usados)]
    print("inscripciones ASECOR:", len(dfa), "| sin ID:", sin_id, "| con ID que NO está en REPORTE CURSOS:", len(faltan),
          "(", faltan["_id"].nunique(), "IDs ) | en cursos descartados:", len(excl), "(", excl["_id"].nunique(), "IDs )")

    texto = [c for c in dfa.columns if re.search(r"curso|institu|sector|etapa|departamento|localidad|modalidad|fecha", str(c), re.I) and c != "ID Curso"]
    estado = next((c for c in dfa.columns if str(c).strip().lower() == "estado"), None)

    def resumen(x: pd.DataFrame) -> pd.DataFrame:
        g = x.groupby("_id")
        out = g.size().rename("Inscripciones").to_frame()
        for c in texto:
            out[c] = g[c].agg(lambda s: next((str(v) for v in s if pd.notna(v)), ""))
        if estado:
            t = x.groupby(["_id", estado]).size().unstack(fill_value=0)
            t.columns = [f"Estado: {c}" for c in t.columns]
            out = out.join(t)
        out = out.reset_index().rename(columns={"_id": "ID Curso"})
        return out.sort_values("Inscripciones", ascending=False)

    destino = Path(os.environ.get("SALIDA", "tmp_ids/ids_sin_curso.xlsx"))
    destino.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(destino) as w:
        resumen(faltan).to_excel(w, sheet_name="ID no están en cursos", index=False)
        resumen(excl).to_excel(w, sheet_name="Cursos desaprob o cancel", index=False)
    print("escrito", destino)


if __name__ == "__main__":
    main()
