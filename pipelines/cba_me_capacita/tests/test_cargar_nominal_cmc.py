"""Pruebas de la carga nominal. Solo datos INVENTADOS."""
import sys
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))
import cargar_nominal_cmc as cn  # noqa: E402


def cursos():
    return pd.DataFrame({
        "ID Curso": [1, 2, 3], "Curso": ["CURSO A", "CURSO B", "CURSO C"], "Institución": ["I1", "I1", "I2"],
        "Tipo Institución": ["REPICA"] * 3, "Sector Productivo": ["INFORMÁTICA"] * 3, "Modalidad Cursado": ["PRESENCIAL"] * 3,
        "Etapa": ["ETAPA 2025"] * 3, "Estado Planif.": ["APROBADO", "APROBADO", "CANCELADO"],
        "Fecha Inicio": ["10/03/2025", "11/03/2025", "12/03/2025"], "Fecha Fin": ["10/06/2025", None, None],
        "Hs. Presenciales": [20, 30, 10], "Hs. A Pagar": [20, 30, 10], "Departamento": ["CAPITAL", "COLON", "CAPITAL"],
        "Localidad": ["CORDOBA CAPITAL", "UNQUILLO", "CORDOBA CAPITAL"], "Sede": ["S1", "S2", "S3"], "Trayecto Formativo": ["T"] * 3,
        "Condición de Pago": ["Monotributista", "Externo", None], "Partida Presupuestaria": ["FP", "FP", None],
        "Total Honorarios": [1000, 2000, 0], "Mat. Pedagógico": [100, 0, 0], "Total": [1100, 2000, 0],
        "Apellido Capacitador": ["PEREZ\nGOMEZ", "LOPEZ", None], "Nombre Capacitador": ["ANA\nLUIS", "MARTA", None],
        "CUIL Capacitador": ["20-11111111-1\n20222222222", "27333333333", None],
    })


def asecor():
    return pd.DataFrame({
        "ID Curso": [1, 1, 2, 3], "Estado": ["EGRESADO", "BAJA", "CURSANDO", "EGRESADO"],
        "Apellido": ["UNO", "DOS", "TRES", "CUATRO"], "Nombre": ["A", "B", "C", "D"],
        "CUIL": [20000000011.0, 20000000022.0, None, 20000000044.0], "Nro. Documento": [100.0, 200.0, 300.0, 400.0],
        "Fecha Nacimiento": ["01/02/1990", None, "03/04/2000", "05/06/1985"], "Edad": [35, 2025, 25, 40], "Sexo": ["F", "M", "F", "M"],
        "Teléfono": [3511111111.0, None, 3512222222.0, None], "Teléfono Alt.": [None] * 4, "Mail": ["a@x.com", None, None, None],
        "Educación": ["SECUNDARIO COMPLETO"] * 4, "Asiste Establecimiento Educativo": ["NO ASISTE"] * 4, "Ámbito Educativo": [None] * 4,
        "Posee Discapacidad": ["NO POSEE DISCAPACIDAD"] * 4, "Tipo Discapacidad": [None] * 4, "Tipo Trabajo": ["INFORMAL"] * 4,
    })


def test_armar_filtra_igual_que_el_tablero():
    c, cap, p = cn.armar(cursos(), asecor())
    assert [f[0] for f in c] == [1, 2]                      # el 3 está cancelado
    assert [f[-1] for f in c] == [2, 1]                     # inscriptos por curso
    assert len(p) == 3 and all(f[0] in (1, 2) for f in p)
    assert all(len(f) == len(cn.COLUMNAS_PARTICIPANTES) for f in p)
    assert all(len(f) == len(cn.COLUMNAS_CURSOS) for f in c)


def test_capacitadores_varios_por_curso():
    _, cap, _ = cn.armar(cursos(), asecor())
    assert sorted(cap) == [(1, "GOMEZ", "LUIS", "20222222222"), (1, "PEREZ", "ANA", "20111111111"), (2, "LOPEZ", "MARTA", "27333333333")]


def test_datos_de_la_persona():
    _, _, p = cn.armar(cursos(), asecor())
    uno = next(f for f in p if f[4] == "20000000011")
    assert uno[5] == "100" and uno[9] == "3511111111" and uno[7] == 35
    assert next(f for f in p if f[2] == "DOS")[7] is None   # edad imposible
    assert uno[-2:] == ("CAPITAL", "CORDOBA")               # zona del curso, con los mismos nombres que el tablero
