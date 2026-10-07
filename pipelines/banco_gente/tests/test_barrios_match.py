import sys
from pathlib import Path

import openpyxl
import pytest

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))

import depurar_barrios as dep  # noqa: E402
from barrios_match import Conciliador, filas_revisar, resumen, texto_resumen  # noqa: E402

CABECERA = ["ID barrio", "Barrio", "Tipo de barrio", "Circuito principal"]
OF, NO = "BarrioOficial", "BarrioNoOficial"
FILAS = [
    (1, "ALBERDI", OF, "0003 - SECCIONAL TERCERA"),
    (2, "VILLA ALBERDI", OF, "011K - VILLA GRAL URQUIZA"),
    (3, "ALTO ALBERDI", OF, "011A - ALTO ALBERDI"),
    (4, "BETANIA", OF, "0012 - AVELLANEDA"),            # repetido: oficial en 0012...
    (5, "BETANIA", NO, "005I - COLINAS DEL SUR"),        # ...y no oficial en otro circuito
    (6, "COLONIA LOLA", OF, "005A - COLONIA LOLA"),
    (7, "COLONIA LOLA", NO, "005F - RENACIMIENTO"),
    (8, "LAS DELICIAS", OF, "011L - COUNTRYS DEL OESTE"),  # dos oficiales con circuitos distintos
    (9, "LAS DELICIAS", OF, "0011 - AERONAUTICO"),
    (10, "GENERAL SAVIO", NO, "013J - VILLA AZALAIS"),    # repetido, mismo circuito
    (11, "GENERAL SAVIO", OF, "013J - VILLA AZALAIS"),
    (12, "20 DE JUNIO", OF, "013C - LAS PALMAS"),
    (13, "SANTA ISABEL 1A SECCION", OF, "010J - SANTA ISABEL"),
    (14, "SANTA ISABEL 2A SECCION", OF, "010J - SANTA ISABEL"),
    (15, "GENERAL PAZ", OF, "006C - GENERAL PAZ"),
    (16, "VILLA ESQUIU", OF, "013I - ESQUIU"),
    (17, "GENERAL PUEYRREDON", OF, "008B - PUEYRREDON"),
    (18, "SD", OF, None),                                  # se ignora
]


@pytest.fixture(scope="module")
def conc(tmp_path_factory):
    d = tmp_path_factory.mktemp("barrios")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Barrios"
    ws.append(CABECERA)
    for f in FILAS:
        ws.append(list(f))
    # depurar_barrios valida que todos sus ALIAS apunten a un barrio de la lista: se agregan los que faltan
    existentes = {f[1] for f in FILAS}
    for i, b in enumerate(sorted(set(dep.ALIAS.values()) - existentes), start=100):
        ws.append([i, b, OF, "999Z - DE RELLENO"])
    xlsx = d / "barrios.xlsx"
    wb.save(xlsx)
    csv = d / "alias.csv"
    csv.write_text("variante,barrio\nSAVIO GRAL,GENERAL SAVIO\nXX,BARRIO NUEVO\nALBERDI VIEJO,VILLA ALBERDI\n",
                   encoding="utf-8")
    return Conciliador(xlsx, csv)


@pytest.mark.parametrize("crudo,barrio,circuito", [
    ("ALBERDI", "ALBERDI", "0003"),
    ("alberdi", "ALBERDI", "0003"),
    ("VILLA ALBERDI", "VILLA ALBERDI", "011K"),     # el nombre con prefijo oficial gana
    ("ALTO ALBERDI", "ALTO ALBERDI", "011A"),
    ("ALBERDI I", "ALBERDI", "0003"),
    ("ALBERDI 2", "ALBERDI", "0003"),
    ("B° ALBERDI", "ALBERDI", "0003"),
    ("BARRIO ALBERDI", "ALBERDI", "0003"),
    ("B° VILLA ALBERDI", "VILLA ALBERDI", "011K"),  # no pierde el VILLA
    ("GRAL PAZ", "GENERAL PAZ", "006C"),
    ("PUEYRREDON", "GENERAL PUEYRREDON", "008B"),   # alias interno de depurar_barrios
    ("ESQUIU", "VILLA ESQUIU", "013I"),             # sobra/falta VILLA
    ("VILA ESQUIU", "VILLA ESQUIU", "013I"),        # error de tipeo (aproximado)
])
def test_asigna_barrio_y_circuito(conc, crudo, barrio, circuito):
    m = conc.conciliar_uno(crudo)
    assert (m.barrio_oficial, m.codigo_circuito) == (barrio, circuito)


def test_repetidos_prefiere_oficial(conc):
    assert conc.conciliar_uno("BETANIA").codigo_circuito == "0012"
    assert conc.conciliar_uno("COLONIA LOLA").codigo_circuito == "005A"


def test_repetido_mismo_circuito(conc):
    m = conc.conciliar_uno("GENERAL SAVIO")
    assert (m.codigo_circuito, m.id_barrio) == ("013J", 11)


def test_repetido_con_circuitos_distintos_asigna_barrio_sin_circuito(conc):
    m = conc.conciliar_uno("LAS DELICIAS")
    assert m.barrio_oficial == "LAS DELICIAS" and m.codigo_circuito is None   # no se elige al azar


def test_ordinales_no_se_mezclan(conc):
    assert conc.conciliar_uno("SANTA ISABEL 2DA SECCION").barrio_oficial == "SANTA ISABEL 2A SECCION"
    assert conc.conciliar_uno("SANTA ISABEL 1RA SECCION").barrio_oficial == "SANTA ISABEL 1A SECCION"
    assert conc.conciliar_uno("20 DE JULIO").barrio_oficial is None            # != 20 DE JUNIO


def test_alias_csv_tiene_prioridad(conc):
    m = conc.conciliar_uno("ALBERDI VIEJO")
    assert (m.barrio_oficial, m.metodo, m.codigo_circuito) == ("VILLA ALBERDI", "ALIAS MANUAL", "011K")
    assert conc.conciliar_uno("SAVIO GRAL").barrio_oficial == "GENERAL SAVIO"


def test_alias_fuera_de_la_lista_oficial_no_inventa_circuito(conc):
    m = conc.conciliar_uno("XX")
    assert (m.barrio_oficial, m.codigo_circuito, m.metodo) == ("BARRIO NUEVO", None, "ALIAS MANUAL")


def test_parecido_insuficiente_solo_sugiere(conc):
    m = conc.conciliar_uno("VILLA ESQUIO")               # 89% < umbral: no se asigna, se sugiere
    assert m.barrio_oficial is None and m.candidatos[0]["barrio"] == "VILLA ESQUIU"


def test_ambiguo_con_circuito_comun_asigna_el_circuito(conc):
    # SANTA ISABEL podría ser la sección 1 o la 2 (no se elige barrio), pero ambas están en 010J
    m = conc.conciliar_uno("SANTA ISABEL")
    assert m.barrio_oficial is None and m.metodo.startswith("AMBIGUO")
    assert m.codigo_circuito == "010J" and len(m.candidatos) == 2


def test_ambiguo_con_circuitos_distintos_no_asigna_circuito(conc):
    m = conc.conciliar_uno("TALLERES")  # no está en esta base mínima: sin coincidencia, sin circuito
    assert m.codigo_circuito is None


def test_sin_coincidencia_queda_sin_asignar(conc):
    m = conc.conciliar_uno("ZZZ INEXISTENTE")
    assert m.barrio_oficial is None and m.codigo_circuito is None and m.metodo == "SIN COINCIDENCIA"


@pytest.mark.parametrize("vacio", ["", "   ", "SD", "SIN DATO", "S/D"])
def test_vacios_quedan_vacios(conc, vacio):
    m = conc.conciliar_uno(vacio)
    assert m.barrio_oficial is None and m.metodo == "SIN DATO"


def test_nombre_mostrado(conc):
    assert conc.conciliar_uno("alberdi").nombre_mostrado == "ALBERDI"            # depurado
    assert conc.conciliar_uno("ZZZ INEXISTENTE").nombre_mostrado == "ZZZ INEXISTENTE"   # original de la base
    assert conc.conciliar_uno("SANTA ISABEL").nombre_mostrado == "SANTA ISABEL"  # ambiguo: original
    for vacio in ["", "SD", "S/D", "SIN DATO"]:                                  # vacío: vacío
        assert conc.conciliar_uno(vacio).nombre_mostrado == ""


def test_resumen_y_revisar(conc):
    cred = {"ALBERDI": 10, "ALBERDI I": 5, "LAS DELICIAS": 3, "ZZZ": 7, "": 2, "ESQUIU": 4}
    ms = conc.conciliar(cred)
    r = resumen(ms, cred)
    assert r["creditos"] == 31
    assert r["con_circuito"]["creditos"] == 19            # ALBERDI + ALBERDI I + ESQUIU
    assert r["con_barrio_oficial"]["creditos"] == 22      # + LAS DELICIAS (sin circuito)
    assert r["por_metodo"]["EXACTO"]["creditos"] == 13   # ALBERDI + LAS DELICIAS
    assert "con circuito asignado" in texto_resumen(r)
    filas = filas_revisar(ms, cred, {})
    assert [(f["barrio"], f["estado"]) for f in filas] == [
        ("ZZZ", "sin_coincidencia"), ("ALBERDI I", "dudoso"), ("ESQUIU", "dudoso"),
        ("LAS DELICIAS", "sin_circuito")]
    assert all(f["barrio"] != "" for f in filas)           # lo vacío no se lista para revisar


# ── Contra la base real (barrios_cordoba.xlsx) ──────────────────────────
@pytest.fixture(scope="module")
def real():
    return Conciliador(AQUI / "barrios_cordoba.xlsx", AQUI / "barrios_alias.csv")


@pytest.mark.parametrize("crudo,barrio,circuito", [
    ("ALBERDI", "ALBERDI", "0003"),
    ("ALBERDI I", "ALBERDI", "0003"),
    ("VILLA ALBERDI", "VILLA ALBERDI", "011K"),
    ("ALTO ALBERDI", "ALTO ALBERDI", "011A"),
    ("B° ALBERDI", "ALBERDI", "0003"),
    ("BETANIA", "BETANIA", "0012"),
    ("GENERAL SAVIO", "GENERAL SAVIO", "013J"),
    ("GRAL PAZ", "GENERAL PAZ", "006C"),
])
def test_base_real(real, crudo, barrio, circuito):
    m = real.conciliar_uno(crudo)
    assert (m.barrio_oficial, m.codigo_circuito) == (barrio, circuito)


@pytest.mark.parametrize("crudo,barrio", [
    ("LA MADRID", "LAMADRID"),
    ("MARECHEL", "MARECHAL"),
    ("CNO. VILLA POSSE -", "CAMINO A VILLA POSE"),
    ("CUIDAD DE MIS SUENOS", "DE MIS SUEÑOS"),
    ("JOSE I DIAZ I SEC", "JOSE IGNACIO DIAZ 1A SECCION"),
    ("JOSE IGNACIO DIAZ I SECCION", "JOSE IGNACIO DIAZ 1A SECCION"),
])
def test_alias_csv_nuevos_resuelven_a_un_barrio_oficial(real, crudo, barrio):
    m = real.conciliar_uno(crudo)
    assert m.barrio_oficial == barrio and m.metodo == "ALIAS MANUAL" and m.codigo_circuito


@pytest.mark.parametrize("crudo,circuito", [
    ("16 DE NOVIEMBRE", "014H"),    # consorcio / cooperativa, mismo circuito
    ("PARQUE LICEO", "013G"),       # secciones 1, 2 y 3
    ("MAIPU", "012B"),
])
def test_base_real_ambiguos_con_circuito_seguro(real, crudo, circuito):
    m = real.conciliar_uno(crudo)
    assert m.barrio_oficial is None and m.codigo_circuito == circuito


def test_base_real_ambiguos_con_circuitos_distintos_sin_circuito(real):
    assert real.conciliar_uno("ARGUELLO LOURDES").codigo_circuito is None


def test_base_real_tiene_111_circuitos(real):
    assert len(real.base.circuitos) == 111
