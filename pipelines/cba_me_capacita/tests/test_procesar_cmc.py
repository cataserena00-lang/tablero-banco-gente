"""Pruebas con datos INVENTADOS (nada de personas reales)."""
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import procesar_cmc as p  # noqa: E402


def test_cuiles_varios_y_con_guiones():
    assert p.cuiles("20-11111111-1\n27222222222") == ["20111111111", "27222222222"]
    assert p.cuiles(float("nan")) == [] and p.cuiles("sin dato") == []


def test_categorias():
    assert p.edad_tramo(17) == 0 and p.edad_tramo(18) == 1 and p.edad_tramo(45) == 3 and p.edad_tramo(2025) == 5 and p.edad_tramo(None) == 5
    assert p.estudios_cat("PRIMARIO - QUINTO GRADO") == 0 and p.estudios_cat("SECUNDARIO COMPLETO") == 2 and p.estudios_cat("UNIVERSITARIO COMPLETO") == 4
    assert p.estudios_cat("TERCIARIO INCOMPLETO") == 3 and p.estudios_cat("SIN DESCRIPCION") == 5
    assert p.trabajo_cat("NO TRABAJA - DESEMPLEADO/A") == 0 and p.trabajo_cat("MONOTRIBUTISTA") == 3 and p.trabajo_cat("CHANGA") == 4
    assert p.discapacidad_cat("NO POSEE DISCAPACIDAD") == 1 and p.discapacidad_cat("POSEE DISCAPACIDAD - CON CERTIFICADO") == 0
    assert p.estado_alumno("INSCRIPTO ") == 0 and p.estado_alumno("NO APROBADO") == 4 and p.estado_alumno("otro") is None


def _cursos():
    return pd.DataFrame({
        "ID Curso": [1, 2, 3, 4], "Curso": ["A", "B", "C", "D"], "Institución": ["I1", "I1", "I2", "I2"],
        "Tipo Institución": ["REPICA", "CEDER/PÚBLICA", "REPICA", "REPICA"], "Sector Productivo": ["INFORMÁTICA"] * 4,
        "Modalidad Cursado": ["PRESENCIAL"] * 4, "Etapa": ["ETAPA 2025", "ETAPA 2025", "ETAPA 2023", "ETAPA 2025"],
        "Estado Planif.": ["APROBADO", "DESAPROBADO", "APROBADO", "APROBADO"],
        "Fecha Inicio": ["10/03/2025", "10/03/2025", "10/03/2023", None], "Hs. Presenciales": [20, 20, 20, 20],
        "Departamento": ["CAPITAL", "CAPITAL", "COLON", "RIO CUARTO"], "Localidad": ["CORDOBA CAPITAL", "CORDOBA CAPITAL", "UNQUILLO", "RIO CUARTO"],
        "CUIL Capacitador": ["20-11111111-1", "20111111111", "20333333333", "27222222222\n27444444444"],
    })


def _asecor():
    return pd.DataFrame({
        "ID Curso": [1, 1, 1, 2, 3, 4],
        "Estado": ["EGRESADO", "BAJA", "EGRESADO", "EGRESADO", "EGRESADO", "CURSANDO"],
        "Sexo": ["F", "M", "F", "F", "F", "X"], "Edad": [20, 50, 20, 30, 30, 2025],
        "Educación": ["SECUNDARIO COMPLETO"] * 6, "Tipo Trabajo": ["INFORMAL"] * 6, "Posee Discapacidad": ["NO POSEE DISCAPACIDAD"] * 6,
        "CUIL": [20000000001.0, 20000000002.0, 20000000001.0, 20000000003.0, 20000000004.0, 20000000005.0],
        "Nro. Documento": [1, 2, 1, 3, 4, 5],
    })


def test_procesar_filtra_2024_y_descarta_desaprobados(tmp_path):
    c, a = tmp_path / "c.xlsx", tmp_path / "a.xlsx"
    _cursos().to_excel(c, index=False)
    _asecor().to_excel(a, index=False)
    datos, meta = p.procesar(c, a, "2026-10-14")
    ids = [f[0] for f in datos["cursos"]]
    assert ids == [1, 4]   # el 2 está desaprobado y el 3 es de 2023; el 4 no tiene fecha pero su etapa es 2025
    assert meta["control"]["cursos_descartados_desaprobados_o_cancelados"] == 1
    assert meta["inscripciones"] == 4   # 3 del curso 1 y 1 del curso 4
    assert meta["personas"] == 3        # la persona 1 se inscribió dos veces en el mismo curso
    assert meta["capacitadores"] == 3   # 20111111111, 27222222222, 27444444444
    caps = datos["capacitadores"]
    assert len(caps) == 2 and len(caps[0]) == 1 and len(caps[1]) == 2          # curso 1: un capacitador; curso 4: dos
    assert len({n for c in caps for n in c}) == meta["capacitadores"] == 3     # números distintos = capacitadores distintos
    v = datos["perfil"][0]
    assert v[0] == 3 and len(v) == p.LARGO_PERFIL
    # sin datos personales en la salida
    import json
    texto = json.dumps(datos)
    assert "20000000001" not in texto and "20111111111" not in texto


def test_inscripto_de_la_etapa_2025_cuenta_como_baja():
    assert p.estado_efectivo("INSCRIPTO ", "ETAPA 2025") == "BAJA"             # curso terminado: cierre no cargado
    assert p.estado_efectivo("INSCRIPTO", "ETAPA 2026") == "INSCRIPTO"         # 2026 en adelante: se respeta (curso que todavía no empezó)
    assert p.estado_efectivo("INSCRIPTO", "ETAPA 2027") == "INSCRIPTO"
    assert p.estado_efectivo("EGRESADO", "ETAPA 2025") == "EGRESADO"           # los demás estados no cambian


def test_planificacion_editando_admin_no_entra():
    df = _cursos()
    df.loc[0, "Estado Planif."] = "Editando Admin"
    cur, *_ = p.cursos_validos(df)
    assert 1 not in set(cur["id"])
