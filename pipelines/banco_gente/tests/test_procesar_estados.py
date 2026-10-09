"""Pruebas de los agregados por estado. Solo datos INVENTADOS."""
import json
import subprocess
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))

import procesar_estados as pe  # noqa: E402


def test_normalizaciones():
    assert pe.departamento("PTE. ROQUE SAENZ PEÑA") == "PRESIDENTE ROQUE SAENZ PENA"
    assert pe.departamento("505") == "SIN DATO"
    assert pe.departamento(None) == "SIN DATO"
    assert pe.departamento("Río Cuarto") == "RIO CUARTO"
    assert pe.localidad("CAPITAL", "CORDOBA CAPITAL") == "CORDOBA"
    assert pe.localidad("COLON", "23153") == "SIN DATO"
    assert pe.localidad("COLON", "La Calera") == "LA CALERA"
    assert pe.estado("EVALUACIÓN TÉCNICA") == "EVALUACION TECNICA"
    assert pe.estado("") == "SIN ESTADO"


def test_lineas_se_agrupan_en_las_tres_oficiales():
    for crudo, esperado in [("L2", pe.LIBRE), ("LIBRE DISPONIBILIDAD", pe.LIBRE), ("L4.", pe.INICIAR), ("L4", pe.INICIAR),
                            ("PE", pe.POTENCIAR), ("POTENCIAR EMPRENDIMIENTO", pe.POTENCIAR), ("L1", pe.OTRAS), ("", pe.OTRAS)]:
        assert pe.linea(crudo) == esperado


def test_monto():
    assert pe.monto("300.000") == 300000
    assert pe.monto("$ 1.250.000") == 1250000
    assert pe.monto("300000") == 300000
    assert pe.monto("300000,60") == 300001
    assert pe.monto("") == 0 and pe.monto(None) == 0 and pe.monto("abc") == 0


def test_mes_clave():
    assert pe.mes_clave("2024", "7") == "2024-07"
    assert pe.mes_clave("2024.0", "12") == "2024-12"
    assert pe.mes_clave("2024", "13") is None
    assert pe.mes_clave("", "3") is None


def test_agregar_y_armar_sin_datos_personales(tmp_path):
    csv_ = tmp_path / "e_prueba.csv"
    subprocess.run([sys.executable, str(AQUI / "generar_csv_sintetico.py"), "--personas", "200", "--salida", str(csv_)], check=True, capture_output=True)
    salida = tmp_path / "out"
    subprocess.run([sys.executable, str(AQUI / "procesar_estados.py"), "--input", str(csv_), "--salida", str(salida)], check=True, capture_output=True)
    texto = (salida / "estados.json").read_text(encoding="utf-8")
    datos = json.loads(texto)
    assert datos["version"] == 2
    assert sum(z[4] for z in datos["zonas"]) == datos["creditos"]
    assert all(len(z) == 6 for z in datos["zonas"]) and all(len(r) == 6 for r in datos["serie"])
    assert sum(r[4] for r in datos["serie"]) <= datos["creditos"]
    assert set(datos["lineas"]) == {pe.LIBRE, pe.INICIAR, pe.POTENCIAR, pe.OTRAS}
    assert "CORDOBA" in datos["loc"] and "CAPITAL" in datos["dep"]
    # Nada nominal: ni nombres ni CUIL ni documentos del CSV de prueba
    for linea in csv_.read_text(encoding="cp1252").splitlines()[1:6]:
        for campo in linea.split(";"):
            if campo.startswith("9") and len(campo) == 8 or "," in campo and campo.isupper():
                assert campo not in texto
    # una segunda corrida con el mismo archivo no regenera
    r = subprocess.run([sys.executable, str(AQUI / "procesar_estados.py"), "--input", str(csv_), "--salida", str(salida)], check=True, capture_output=True, text=True)
    assert "Sin cambios" in r.stdout
