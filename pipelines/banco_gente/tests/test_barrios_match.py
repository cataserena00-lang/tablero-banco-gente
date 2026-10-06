import sys
from pathlib import Path

import pytest

AQUI = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AQUI))

from barrios_match import (BaseBarrios, RegistroBase, cargar_alias, conciliar, conciliar_uno,  # noqa: E402
                           filas_revisar, normalizar, resumen)


def reg(i, barrio, codigo, oficial=True, circuito="X"):
    return RegistroBase(i, barrio, oficial, codigo, circuito)


@pytest.fixture
def base():
    return BaseBarrios([
        reg(1, "ALBERDI", "0003", circuito="SECCIONAL TERCERA"),
        reg(2, "VILLA ALBERDI", "011K"),
        reg(3, "ALTO ALBERDI", "011A"),
        reg(4, "BETANIA", "0012", True),            # repetido: oficial en 0012...
        reg(5, "BETANIA", "005I", False),           # ...y no oficial en otro circuito
        reg(6, "COLONIA LOLA", "005A", True),
        reg(7, "COLONIA LOLA", "005F", False),
        reg(8, "LAS DELICIAS", "011L", True),       # dos oficiales en circuitos distintos
        reg(9, "LAS DELICIAS", "0011", True),
        reg(10, "GENERAL SAVIO", "013J", False),    # repetido, mismo circuito
        reg(11, "GENERAL SAVIO", "013J", True),
        reg(12, "20 DE JUNIO", "013C"),
        reg(13, "SANTA ISABEL 1A SECCION", "010J"),
        reg(14, "SANTA ISABEL 2A SECCION", "010J"),
        reg(15, "TALLERES ESTE", "0013"),
        reg(16, "TALLERES OESTE", "0013"),
        reg(17, "GENERAL PAZ", "006C"),
        reg(18, "VILLA ESQUIU", "013I"),
    ])


def test_normalizar():
    assert normalizar("B° Alberdí.") == "B ALBERDI"
    assert normalizar("  1RO. DE   MAYO ") == "1RO DE MAYO"
    assert normalizar(None) == ""


@pytest.mark.parametrize("crudo,barrio,circuito,metodo", [
    ("ALBERDI", "ALBERDI", "0003", "exacto"),
    ("alberdi", "ALBERDI", "0003", "exacto"),
    ("VILLA ALBERDI", "VILLA ALBERDI", "011K", "exacto"),      # el nombre con prefijo oficial gana
    ("ALTO ALBERDI", "ALTO ALBERDI", "011A", "exacto"),
    ("ALBERDI I", "ALBERDI", "0003", "limpieza"),
    ("ALBERDI 2", "ALBERDI", "0003", "limpieza"),
    ("B° ALBERDI", "ALBERDI", "0003", "limpieza"),
    ("BARRIO ALBERDI", "ALBERDI", "0003", "limpieza"),
    ("B° VILLA ALBERDI", "VILLA ALBERDI", "011K", "limpieza"),  # no pierde el VILLA
    ("VILLA ALBERDI II", "VILLA ALBERDI", "011K", "limpieza"),
    ("VILLA ESQUIU", "VILLA ESQUIU", "013I", "exacto"),
    ("ESQUIU", None, None, "sin_clasificar"),                   # no se agrega VILLA por su cuenta
])
def test_alberdi_y_prefijos(base, crudo, barrio, circuito, metodo):
    m = conciliar_uno(crudo, base, {})
    assert (m.barrio_oficial, m.codigo_circuito, m.metodo) == (barrio, circuito, metodo)


def test_villa_se_descarta_solo_como_ultimo_recurso(base):
    m = conciliar_uno("VILLA GENERAL PAZ", base, {})
    assert (m.barrio_oficial, m.metodo) == ("GENERAL PAZ", "limpieza")
    assert m.confianza < 0.9 and m.dudoso


def test_repetido_prefiere_oficial(base):
    m = conciliar_uno("BETANIA", base, {})
    assert (m.codigo_circuito, m.metodo) == ("0012", "exacto")
    assert conciliar_uno("COLONIA LOLA", base, {}).codigo_circuito == "005A"


def test_repetido_mismo_circuito_se_asigna(base):
    m = conciliar_uno("GENERAL SAVIO", base, {})
    assert (m.codigo_circuito, m.id_barrio) == ("013J", 11)


def test_repetido_con_circuitos_distintos_es_ambiguo(base):
    m = conciliar_uno("LAS DELICIAS", base, {})
    assert m.metodo == "ambiguo" and m.codigo_circuito is None and m.barrio_oficial is None
    assert {c["circuito"] for c in m.candidatos} == {"011L", "0011"}


def test_alias_tiene_prioridad_maxima(base):
    # "ALBERDI" coincide exacto, pero el override manual manda
    m = conciliar_uno("ALBERDI", base, {"ALBERDI": "VILLA ALBERDI"})
    assert (m.barrio_oficial, m.metodo, m.codigo_circuito) == ("VILLA ALBERDI", "alias", "011K")
    m = conciliar_uno("GRAL PAZ", base, {"GRAL PAZ": "GENERAL PAZ"})
    assert (m.barrio_oficial, m.metodo) == ("GENERAL PAZ", "alias")


def test_alias_a_barrio_fuera_de_la_base_no_inventa_circuito(base):
    m = conciliar_uno("XX", base, {"XX": "BARRIO NUEVO"})
    assert (m.barrio_oficial, m.codigo_circuito, m.metodo) == ("BARRIO NUEVO", None, "alias")


def test_fuzzy_corrige_typos_y_queda_para_revisar(base):
    m = conciliar_uno("VILLA ESQUIO", base, {})
    assert (m.barrio_oficial, m.metodo) == ("VILLA ESQUIU", "fuzzy") and m.dudoso


def test_fuzzy_no_mezcla_numeros_meses_ni_puntos_cardinales(base):
    assert conciliar_uno("20 DE JULIO", base, {}).metodo == "sin_clasificar"
    assert conciliar_uno("SANTA ISABEL 3A SECCION", base, {}).metodo == "sin_clasificar"
    assert conciliar_uno("TALLERES NORTE", base, {}).metodo == "sin_clasificar"
    assert conciliar_uno("SANTA ISABEL 2DA SECCION", base, {}).barrio_oficial == "SANTA ISABEL 2A SECCION"


def test_fuzzy_con_dos_candidatos_cercanos_no_asigna():
    b = BaseBarrios([reg(1, "LOMAS BELLAS", "A"), reg(2, "LOMAS BELLOS", "B")])
    m = conciliar_uno("LOMAS BELLIS", b, {})
    assert m.metodo == "ambiguo" and m.codigo_circuito is None and len(m.candidatos) == 2


def test_sin_clasificar_y_sin_dato(base):
    assert conciliar_uno("ZZZ INEXISTENTE", base, {}).metodo == "sin_clasificar"
    assert conciliar_uno("SIN DATO", base, {}).metodo == "sin_dato"
    assert conciliar_uno("", base, {}).metodo == "sin_dato"


def test_resumen_y_revisar(base):
    cred = {"ALBERDI": 10, "ALBERDI I": 5, "LAS DELICIAS": 3, "ZZZ": 7, "SIN DATO": 2}
    ms = conciliar(cred, base, {})
    r = resumen(ms, cred)
    assert r["por_metodo"]["exacto"]["creditos"] == 10 and r["por_metodo"]["limpieza"]["barrios"] == 1
    assert r["con_circuito"]["creditos"] == 15 and r["creditos"] == 27
    filas = filas_revisar(ms, cred, {})
    assert [f["barrio"] for f in filas] == ["ZZZ", "LAS DELICIAS"]    # ordenado por créditos; sin SIN DATO
    assert filas[1]["estado"] == "ambiguo" and filas[1]["candidatos"]


# ── Contra la base real (barrios_cordoba.xlsx) ──────────────────────────
@pytest.fixture(scope="module")
def base_real():
    return BaseBarrios.desde_excel(AQUI / "barrios_cordoba.xlsx")


def test_base_real_se_carga(base_real):
    assert len(base_real.circuitos) == 111
    assert all(r.barrio.upper() != "SD" for r in base_real.registros)


@pytest.mark.parametrize("crudo,barrio,circuito", [
    ("ALBERDI", "ALBERDI", "0003"),
    ("ALBERDI I", "ALBERDI", "0003"),
    ("VILLA ALBERDI", "VILLA ALBERDI", "011K"),
    ("ALTO ALBERDI", "ALTO ALBERDI", "011A"),
    ("B° ALBERDI", "ALBERDI", "0003"),
    ("BETANIA", "BETANIA", "0012"),
    ("GENERAL SAVIO", "GENERAL SAVIO", "013J"),
])
def test_base_real(base_real, crudo, barrio, circuito):
    m = conciliar_uno(crudo, base_real, {})
    assert (m.barrio_oficial, m.codigo_circuito) == (barrio, circuito)


def test_alias_csv_actual_se_carga():
    a = cargar_alias(AQUI / "barrios_alias.csv")
    assert a["GRAL PAZ"] == "GENERAL PAZ"
