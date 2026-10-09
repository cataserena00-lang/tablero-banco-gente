import { readFileSync } from "node:fs";
import path from "node:path";

// Para sumar otra base: crear data/<dataset>/ con su pipeline y llamar cargar("<dataset>", "archivo").
export function cargar<T>(dataset: string, archivo: string, ext = "json"): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", dataset, `${archivo}.${ext}`), "utf-8"));
}

/** Como `cargar`, pero devuelve null si el archivo todavía no existe (por ejemplo, datos que genera otro workflow). */
export function cargarOpcional<T>(dataset: string, archivo: string, ext = "json"): T | null {
  try { return cargar<T>(dataset, archivo, ext); } catch { return null; }
}
