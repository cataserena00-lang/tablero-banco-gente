"""Genera un CSV de prueba con personas y solicitudes INVENTADAS, con las mismas columnas que ESTADOS CREDITOS BG.csv.

Sirve para probar la carga (cargar_personas.py) y la vista de personas sin usar datos reales.
Los documentos empiezan con 9 y tienen 8 dígitos (no existen como DNI reales) y los CUIL son inventados.

Uso:
  python pipelines/banco_gente/generar_csv_sintetico.py --personas 300 --salida estados_prueba.csv
  (el archivo queda donde indiques: NO lo subas al repo; está en .gitignore si termina en _prueba.csv)
"""
import argparse
import csv
import random

ENCABEZADO = [
    "Departamento", "Localidad", "Estado<br>Préstamo", "Línea", "Nro<br> Documento", "Nombre", "Nro<br>Formulario", "Cuil",
    "Monto<br> Prestable", "Plazo<br> Devolución", "Fecha Pago<br> Emitido", "Fecha<br>Aprobado", "Fecha<br>Pago Banco",
    "Valor<br> Cuota", "Monto Deuda", "Deuda<br>Vencida", "Fec.Ultima<br>Cta.Cancelada", "Nº Última<br> Cta.Cancelada",
    "Monto<br>Recupero", "Año", "Mes",
]
APELLIDOS = ["ACOSTA", "BUSTOS", "CARRIZO", "DOMINGUEZ", "FERREYRA", "GIMENEZ", "HEREDIA", "IBAÑEZ", "JUAREZ", "LUNA",
             "MORENO", "NIETO", "OLMOS", "PEREYRA", "QUIROGA", "RIOS", "SOSA", "TORRES", "VEGA", "YANEZ"]
NOMBRES = ["ANA", "BRUNO", "CARLA", "DIEGO", "ELENA", "FABIAN", "GABRIELA", "HUGO", "INES", "JORGE", "KARINA", "LUCAS",
           "MARTA", "NICOLAS", "OLGA", "PABLO", "ROMINA", "SERGIO", "TERESA", "VICTOR"]
LUGARES = [("CAPITAL", "CORDOBA CAPITAL", 60), ("COLON", "VILLA ALLENDE", 7), ("RIO CUARTO", "RIO CUARTO", 6),
           ("PUNILLA", "VILLA CARLOS PAZ", 5), ("SAN JUSTO", "SAN FRANCISCO", 4), ("CRUZ DEL EJE", "CRUZ DEL EJE", 4),
           ("TERCERO ARRIBA", "RIO TERCERO", 4), ("GENERAL SAN MARTIN", "VILLA MARIA", 4), ("MARCOS JUAREZ", "MARCOS JUAREZ", 3),
           ("SANTA MARIA", "ALTA GRACIA", 3)]
ESTADOS = [("RECHAZADO", 50), ("PAGADO", 24), ("FINALIZADO", 14), ("BAJA ADMINISTRATIVA", 4), ("DESISTIDO", 3),
           ("A PAGAR", 2), ("IMPAGO", 2), ("MUTUO FIRMADO", 1)]
LINEAS = [("LIBRE DISPONIBILIDAD", 84), ("L4.", 9), ("POTENCIAR EMPRENDIMIENTO", 6), ("L2", 1)]


def elegir(r, pares):
    return r.choices([p[:-1] if len(p) > 2 else p[0] for p in pares], weights=[p[-1] for p in pares])[0]


def generar(personas: int, semilla: int):
    r = random.Random(semilla)
    formulario = 2_000_000
    for i in range(personas):
        doc = f"9{r.randint(0, 9_999_999):07d}"
        cuil = f"20{doc}{r.randint(0, 9)}"
        nombre = f"{r.choice(APELLIDOS)}, {r.choice(NOMBRES)} {r.choice(NOMBRES)}"
        dpto, loc = elegir(r, LUGARES)
        for _ in range(r.choices([1, 2, 3, 4, 6], weights=[60, 20, 10, 6, 4])[0]):
            formulario += r.randint(1, 40)
            ano = r.choice([2022, 2023, 2023, 2024, 2024, 2025, 2025, 2026])
            mes = r.randint(1, 12 if ano < 2026 else 10)
            estado = elegir(r, ESTADOS)
            linea = elegir(r, LINEAS)
            monto = r.choice([250000, 300000, 500000, 700000, 1000000])
            pagado = estado in ("PAGADO", "FINALIZADO", "IMPAGO")
            yield [dpto, loc, estado, linea, doc, nombre, formulario, cuil, monto, r.choice([12, 18, 24]),
                   f"{r.randint(1, 28)}/{mes}/{ano}" if pagado else "", f"{r.randint(1, 28)}/{mes}/{ano}" if estado != "RECHAZADO" else "",
                   f"{ano}-{mes:02d}-{r.randint(1, 28):02d}" if pagado else "", int(monto / 12), "", "", "", "", "", ano, mes]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--personas", type=int, default=300)
    ap.add_argument("--salida", default="estados_prueba.csv")
    ap.add_argument("--semilla", type=int, default=1)
    a = ap.parse_args()
    filas = list(generar(a.personas, a.semilla))
    # cp1252 y ";" como el archivo real, para probar también la detección de codificación
    with open(a.salida, "w", encoding="cp1252", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(ENCABEZADO)
        w.writerows(filas)
    print(f"{len(filas)} solicitudes de {a.personas} personas inventadas en {a.salida}")


if __name__ == "__main__":
    main()
