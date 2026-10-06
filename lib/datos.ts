import { readFileSync } from "node:fs";
import path from "node:path";

// Para sumar otra base: crear data/<dataset>/ con su pipeline y llamar cargar("<dataset>", "archivo").
export function cargar<T>(dataset: string, archivo: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", dataset, `${archivo}.json`), "utf-8"));
}
