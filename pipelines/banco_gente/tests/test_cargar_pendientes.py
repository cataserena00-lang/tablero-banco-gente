"""Pruebas de la carga de pendientes. Solo datos INVENTADOS."""
import sys
from pathlib import Path

import pandas as pd
import pytest
import yaml

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))

import barrios_match as bm  # noqa: E402
import cargar_pendientes as cpd  # noqa: E402

CFG = yaml.safe_load((AQUI / "config.yaml").read_text(encoding="utf-8"))


def excel_inventado() -> pd.DataFrame:
    return pd.DataFrame({
        "Apellido y<br>Nombre": ["PERSONA UNO", "PERSONA DOS", "PERSONA TRES", "PERSONA CUATRO"],
        "CUIL": [20000000011, 20000000022, 20000000033, 20000000044],
        "Monto Prestable": [300000.0, 500000.0, 1000000.0, 250000.0],
        "Fecha Aprobación": pd.to_datetime(["2026-01-05", "2026-02-10", None, "2026-03-15"]),
        "Domicilio": ["CALLE FALSA 123 - ALTA CORDOBA", "AV. INVENTADA 45", "SAN MARTIN 10", "RUTA 5 KM 3"],
        "Localidad": ["CORDOBA", "CORDOBA", "La Calera", "SIN ASIGNAR"],
        "Departamento": ["CAPITAL", "CAPITAL", "COLON", "CAPITAL"],
        "Línea": ["L2", "PE", "L4.", "LIBRE DISPONIBILIDAD"],
    })


@pytest.fixture(scope="module")
def conciliador():
    return bm.Conciliador(AQUI / "barrios_cordoba.xlsx", AQUI / "barrios_alias.csv")


def test_tipos_sql():
    df = excel_inventado()
    assert cpd.tipo_sql(df["Monto Prestable"]) == "double precision"
    assert cpd.tipo_sql(df["Fecha Aprobación"]) == "date"
    assert cpd.tipo_sql(df["Localidad"]) == "text"


def test_valor():
    assert cpd.valor(float("nan"), "text") is None
    assert cpd.valor(None, "double precision") is None
    assert cpd.valor(pd.NaT, "date") is None
    assert str(cpd.valor(pd.Timestamp("2026-01-05"), "date")) == "2026-01-05"
    assert cpd.valor(300000, "double precision") == 300000.0
    assert cpd.valor("  hola   mundo ", "text") == "hola mundo"
    assert cpd.valor("   ", "text") is None


def test_preparar_agrega_zona_barrio_y_linea(conciliador):
    out, tipos = cpd.preparar(excel_inventado(), CFG, conciliador)
    assert out["zona_dep"].tolist() == ["CAPITAL", "CAPITAL", "COLON", "CAPITAL"]
    assert out["zona_loc"].tolist() == ["CORDOBA", "CORDOBA", "LA CALERA", "SIN ASIGNAR"]
    assert out["linea_oficial"].tolist() == ["Libre disponibilidad", "Potenciar emprendimiento", "Iniciar emprendimiento", "Libre disponibilidad"]
    # Barrio solo para Capital/Córdoba; vacío si el domicilio no informa; nulo fuera de Capital
    assert out["barrio"].iloc[0] == "ALTA CORDOBA"
    assert out["barrio"].iloc[1] == ""
    assert pd.isna(out["barrio"].iloc[2]) and pd.isna(out["barrio"].iloc[3])
    # Las columnas originales quedan normalizadas, con su tipo
    assert "apellido_y_nombre" in out.columns and "monto_prestable" in out.columns
    assert tipos["monto_prestable"] == "double precision" and tipos["fecha_aprobacion"] == "date" and tipos["barrio"] == "text"


def test_preparar_falla_si_falta_una_columna(conciliador):
    df = excel_inventado().drop(columns=["Domicilio"])
    with pytest.raises(SystemExit):
        cpd.preparar(df, CFG, conciliador)


def test_sql_solo_identificadores_seguros(conciliador):
    _, tipos = cpd.preparar(excel_inventado(), CFG, conciliador)
    assert all(__import__("re").fullmatch(r"[a-z0-9_]+", n) for n in tipos)
    assert 'CREATE TABLE pendientes_paso' in cpd.sql_crear_tabla(tipos)
    assert "GRANT SELECT ON pendientes TO lectura" in cpd.SQL_INTERCAMBIO
