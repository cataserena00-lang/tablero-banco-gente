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


# ── Una fila por solicitud; una persona puede tener varias ───────────────────────────────────────────────────────
def test_mapeo_reconoce_ano_mes_y_formulario():
    d = cp.mapear_canonicas(cp.columnas_unicas(["Departamento", "Localidad", "Estado<br>Préstamo", "Nombre", "Nro<br>Formulario", "Año", "Mes"]))
    assert d == ["departamento", "localidad", "estado", "nombre", "nro_formulario", "ano", "mes"]
    # con la ñ rota (como llega a veces en el Excel convertido) también se reconoce
    rota = cp.mapear_canonicas(cp.columnas_unicas(["Departamento", "Localidad", "Estado", "Nombre", "A�o", "Mes"]))
    assert rota[4] == "ano" and rota[5] == "mes"


def test_clave_persona_prefiere_cuil_luego_documento_luego_nombre():
    assert cp.clave_persona("Pérez, Ana", "20-12345678-9", "12.345.678") == "C20123456789"
    assert cp.clave_persona("Pérez, Ana", "", "12.345.678") == "D12345678"
    assert cp.clave_persona("Pérez,  Ana", None, None) == "NPEREZ, ANA"
    # el mismo CUIL escrito distinto es la misma persona; el mismo nombre con otro CUIL, no
    assert cp.clave_persona("A", "20123456789", "") == cp.clave_persona("B", "20-12345678-9", "")
    assert cp.clave_persona("Pérez, Ana", "20111111111", "") != cp.clave_persona("Pérez, Ana", "20222222222", "")


def test_orden_es_por_periodo_y_a_igual_periodo_por_formulario():
    o = cp.calcular_orden
    assert o("2024", "1", "100", 1) > o("2023", "12", "999999", 2)      # el período manda
    assert o("2023", "10", "2234336", 1) > o("2023", "10", "2234325", 2)  # mismo período: mayor formulario
    assert o("2023", "10.0", "5", 1) == o("2023", "10", "5", 9)         # "10.0" (Excel) = 10
    assert o("", "", "", 7) == 7 and o("", "", "", 8) > o("", "", "", 7)  # sin datos: orden del archivo
    assert o("2023", "13", "1", 1) == o("2023", "", "1", 1)            # mes inválido = sin mes


def test_resumen_toma_la_ultima_solicitud_y_cuenta_todas():
    sql = cp.sql_llenar_resumen(["departamento", "localidad", "estado", "nombre", "cuil", "ano", "mes"])
    assert "DISTINCT ON (persona)" in sql and "ORDER BY persona, orden DESC" in sql
    assert "count(*) OVER (PARTITION BY persona)" in sql
    assert "NULL::text" in sql                      # columnas que el CSV no trae (linea, nro_doc, nro_formulario) quedan vacías
    assert '"estado"' in sql and '"linea"' not in sql


def test_intercambio_reemplaza_ambas_tablas_y_da_permiso_de_lectura():
    s = "\n".join(cp.SQL_INTERCAMBIO)
    for t in ("personas", "personas_resumen"):
        assert f"DROP TABLE IF EXISTS {t}\n" in s + "\n" and f"GRANT SELECT ON {t} TO lectura" in s
    assert "RENAME TO personas_resumen" in s


def test_csv_sintetico_se_lee_con_el_cargador(tmp_path):
    import generar_csv_sintetico as gen
    p = tmp_path / "estados_prueba.csv"
    filas = list(gen.generar(40, 7))
    import csv
    with open(p, "w", encoding="cp1252", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(gen.ENCABEZADO)
        w.writerows(filas)
    f, lector = cp.abrir_csv(p)
    with f:
        enc = next(lector)
        cols = cp.mapear_canonicas(cp.columnas_unicas(enc))
        leidas = list(lector)
    assert len(leidas) == len(filas) and len(leidas) >= 40
    i = {c: cols.index(c) for c in ("cuil", "nro_formulario", "ano", "mes")}
    claves = {cp.clave_persona(r[cols.index("nombre")], r[i["cuil"]], r[cols.index("nro_doc")]) for r in leidas}
    assert len(claves) == 40                                   # 40 personas inventadas, más solicitudes que personas
    assert len({r[i["nro_formulario"]] for r in leidas}) == len(leidas)   # cada fila es una solicitud distinta
