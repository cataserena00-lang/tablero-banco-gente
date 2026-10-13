"""Pruebas de la lectura de fechas de la base de pendientes y de la descarga de estados. Solo datos INVENTADOS."""
import io
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import pytest
from openpyxl import Workbook

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))

import drive_carpeta as dc  # noqa: E402
import procesar as pr  # noqa: E402


def test_fechas_reales_de_excel_no_se_pierden():
    # El Excel nuevo trae celdas de fecha (datetime64): antes se convertían a número y quedaba todo vacío
    s = pd.Series(pd.to_datetime(["2026-01-05", "2026-02-10", None]))
    r = pr.parsear_fecha(s)
    assert r.notna().sum() == 2 and r.iloc[0] == pd.Timestamp("2026-01-05")


def test_fechas_como_texto_y_serie_de_excel():
    s = pd.Series(["46296", "2025-11-03 00:00:00", None, "raro"], dtype=object)
    r = pr.parsear_fecha(s)
    assert r.iloc[0] == pd.Timestamp("2026-10-01")
    assert r.iloc[1] == pd.Timestamp("2025-11-03")
    assert pd.isna(r.iloc[2]) and pd.isna(r.iloc[3])


def test_fechas_mezcladas_en_una_columna():
    s = pd.Series([datetime(2026, 3, 15), "46296", "2025-11-03", 46300, None], dtype=object)
    r = pr.parsear_fecha(s)
    assert [x.strftime("%Y-%m-%d") for x in r.dropna()] == ["2026-03-15", "2026-10-01", "2025-11-03", "2026-10-05"]


def test_procesar_se_detiene_si_no_se_entiende_ninguna_fecha(tmp_path):
    # Excel inventado con fechas ilegibles: el pipeline no debe escribir un tablero vacío
    wb = Workbook()
    ws = wb.active
    ws.append(["Monto Prestable", "Fecha Aprobación", "Domicilio", "Localidad", "Departamento", "Línea"])
    for i in range(3):
        ws.append([300000, "fecha ilegible", "CALLE FALSA 1 - ALTA CORDOBA", "CORDOBA", "CAPITAL", "L2"])
    x = tmp_path / "b.xlsx"
    wb.save(x)
    sys.argv = ["procesar.py", "--input", str(x), "--salida", str(tmp_path / "out")]
    with pytest.raises(SystemExit) as e:
        pr.main()
    assert "fecha de aprobación" in str(e.value)
    assert not (tmp_path / "out" / "cubo.json").exists()


def test_estados_a_csv_con_descarga_de_excel(tmp_path, monkeypatch):
    """La descarga se guarda con extensión de Excel (openpyxl no abre otra) y se convierte a CSV."""
    def falso_bajar(carpeta_id, nombre, destino):
        assert str(destino).endswith(".xlsx")
        wb = Workbook()
        ws = wb.active
        ws.append(["Departamento", "Localidad", "Estado", "Línea", "Nombre"])
        ws.append(["COLON", "LA CALERA", "PAGADO", "L2", "PERSONA UNO"])
        wb.save(destino)
        return {"name": "BASE ESTADO DE CREDITOS.xlsx", "modifiedTime": "2026-10-13T16:05:08Z"}
    monkeypatch.setattr(dc, "bajar_por_nombre", falso_bajar)
    salida = tmp_path / "estados.csv"
    dc.estados_a_csv("carpeta", salida)
    assert salida.exists() and not list(tmp_path.glob("*_descarga*"))
    assert salida.read_text(encoding="utf-8-sig").splitlines()[0] == "Departamento;Localidad;Estado;Línea;Nombre"
