"""Pruebas del cargador de personas. Solo datos INVENTADOS: nunca usar datos reales en tests ni en el repo."""
import sys
from pathlib import Path

import pytest

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))

import cargar_personas as cp  # noqa: E402

ENCABEZADO = ["Departamento", "Localidad", "Estado", "Línea", "Nro<br> Doc", "Nombre", "Nro<br>Formulario", "Cuil",
              "Monto<br>", "Plazo<br> Cuotas", "Fecha<br>Aprob", "Fecha<br>Pago", "Monto Deuda", "Fec.Ultima Pago"]


def test_normalizar_columna():
    assert cp.normalizar_columna("Nro<br> Doc") == "nro_doc"
    assert cp.normalizar_columna("Línea") == "linea"
    assert cp.normalizar_columna("Fec.Ultima Pago") == "fec_ultima_pago"
    assert cp.normalizar_columna("Monto<br>") == "monto"
    assert cp.normalizar_columna("  ") == "columna"


def test_columnas_unicas_desambigua_repetidas():
    assert cp.columnas_unicas(["Fecha", "Fecha<br>", "Estado"]) == ["fecha", "fecha_2", "estado"]


def test_mapeo_a_nombres_canonicos():
    destino = cp.mapear_canonicas(cp.columnas_unicas(ENCABEZADO))
    assert destino[:8] == ["departamento", "localidad", "estado", "linea", "nro_doc", "nombre", "nro_formulario", "cuil"]
    assert len(set(destino)) == len(destino)


def test_mapeo_falla_si_falta_una_obligatoria():
    with pytest.raises(SystemExit) as e:
        cp.mapear_canonicas(cp.columnas_unicas(["Departamento", "Localidad", "Estado"]))   # falta nombre
    assert "nombre" in str(e.value)


def test_texto_busqueda_sin_tildes_y_con_digitos():
    assert cp.texto_busqueda("Pérez, María", "20-12345678-9", "12.345.678") == "PEREZ, MARIA 20123456789 12345678"
    assert cp.texto_busqueda("Ana  Gómez", "", None) == "ANA GOMEZ"
    assert cp.texto_busqueda("", "", "") == ""


def test_abrir_csv_detecta_delimitador_y_codificacion(tmp_path):
    p = tmp_path / "a.csv"
    p.write_bytes("Departamento;Localidad;Estado;Nombre\nPUNILLA;VILLA X;IMPAGO;Ñandú, Juana\n".encode("cp1252"))
    f, lector = cp.abrir_csv(p)
    with f:
        filas = list(lector)
    assert filas[0] == ["Departamento", "Localidad", "Estado", "Nombre"]
    assert filas[1][3] == "Ñandú, Juana"          # cp1252 bien leído y coma dentro del campo respetada


def test_sql_solo_usa_identificadores_normalizados():
    sql = cp.sql_crear_tabla(["departamento", "nro_doc"])
    assert '"departamento" text' in sql and '"nro_doc" text' in sql and "busqueda text NOT NULL" in sql
    assert all("DROP" not in s or s.startswith("DROP TABLE IF EXISTS personas") for s in cp.SQL_INTERCAMBIO)


def test_huella_es_estable(tmp_path):
    p = tmp_path / "a.csv"
    p.write_text("x\n1\n")
    assert cp.huella_archivo(p) == cp.huella_archivo(p) and len(cp.huella_archivo(p)) == 64
