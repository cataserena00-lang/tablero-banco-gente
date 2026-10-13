"""Pruebas de la lectura de la carpeta de Drive y la conversión de xlsx a CSV. Solo datos INVENTADOS."""
import sys
from datetime import date, datetime
from pathlib import Path

import pytest
from openpyxl import Workbook

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))

import cargar_personas as cp  # noqa: E402
import drive_carpeta as dc  # noqa: E402
import procesar_estados as pe  # noqa: E402


def test_normalizar_nombre():
    assert dc.normalizar_nombre("BASE PENDIENTES.xlsx") == "BASE PENDIENTES"
    assert dc.normalizar_nombre("  Base  Estado de Créditos .XLSX") == "BASE ESTADO DE CREDITOS"
    assert dc.normalizar_nombre("BASE ESTADO DE CREDITOS") == "BASE ESTADO DE CREDITOS"


def test_elegir_el_archivo_correcto():
    archivos = [
        {"id": "1", "name": "Versiones anteriores", "mimeType": dc.CARPETA, "modifiedTime": "2026-10-13T13:00:00Z"},
        {"id": "2", "name": "BASE PENDIENTES.xlsx", "mimeType": dc.XLSX, "modifiedTime": "2026-10-13T16:05:00Z"},
        {"id": "3", "name": "BASE ESTADO DE CREDITOS.xlsx", "mimeType": dc.XLSX, "modifiedTime": "2026-10-13T16:05:00Z"},
        {"id": "4", "name": "BASE PENDIENTES.xlsx", "mimeType": dc.XLSX, "modifiedTime": "2026-10-20T16:05:00Z"},   # más nuevo
        {"id": "5", "name": "BASE PENDIENTES", "mimeType": dc.CARPETA, "modifiedTime": "2026-10-30T16:05:00Z"},   # carpeta: se ignora
    ]
    assert dc.elegir(archivos, dc.NOMBRE_PENDIENTES)["id"] == "4"
    assert dc.elegir(archivos, dc.NOMBRE_ESTADOS)["id"] == "3"
    assert dc.elegir(archivos, "BASE INEXISTENTE") is None


def test_texto_celda():
    assert dc.texto_celda(None, "x") == ""
    assert dc.texto_celda(datetime(2024, 7, 23), "Fecha") == "23/7/2024"
    assert dc.texto_celda(date(2024, 7, 3), "Fecha") == "3/7/2024"
    assert dc.texto_celda(20000000011.0, "Cuil") == "20000000011"
    assert dc.texto_celda(300000.0, "Monto Prestable") == "300.000"
    assert dc.texto_celda(500, "Monto Prestable") == "500"
    assert dc.texto_celda(9000001, "Nro Doc") == "9000001"
    assert dc.texto_celda("  hola   mundo ", "Nombre") == "hola mundo"


def xlsx_inventado(ruta: Path):
    wb = Workbook()
    ws = wb.active
    ws.append(["Departamento", "Localidad", "Estado\nPréstamo", "Línea", "Nro Doc", "Nombre", "Nro Formulario", "Cuil", "Monto Prestable", "Fecha Aprobado", "Año", "Mes", None])
    ws.append(["CAPITAL", "CORDOBA CAPITAL", "PAGADO", "L2", 9000001, "PERSONA UNO", 100, 20900000011, 300000, datetime(2025, 3, 5), 2025, 3, None])
    ws.append([None] * 13)   # fila vacía: se ignora
    ws.append(["PTE. ROQUE SAENZ PEÑA", "LABOULAYE", "RECHAZADO", "PE", 9000002, "PERSONA DOS", 101, 20900000022, 500000, None, 2026, 1, None])
    wb.save(ruta)


def test_xlsx_a_csv_y_se_lee_con_el_cargador(tmp_path):
    x, c = tmp_path / "e.xlsx", tmp_path / "e.csv"
    xlsx_inventado(x)
    assert dc.es_xlsx(x)
    assert dc.xlsx_a_csv(x, c) == 2
    f, lector = cp.abrir_csv(c)
    with f:
        columnas = cp.mapear_canonicas(cp.columnas_unicas(next(lector)))
        assert columnas[:4] == ["departamento", "localidad", "estado", "linea"]
        res = pe.agregar(lector, columnas)
    assert res["filas"] == 2
    datos = pe.armar(res, "2026-10-13")
    assert sorted(datos["dep"]) == ["CAPITAL", "PRESIDENTE ROQUE SAENZ PENA"]
    assert "CORDOBA" in datos["loc"] and set(datos["estados"]) == {"PAGADO", "RECHAZADO"}
    montos = sorted(z[5] for z in datos["zonas"])
    assert montos == [300000, 500000]   # «300.000» (con puntos de miles) se lee bien


def test_es_xlsx_distingue_csv(tmp_path):
    c = tmp_path / "a.csv"
    c.write_text("a;b\n1;2\n", encoding="utf-8")
    assert not dc.es_xlsx(c)
