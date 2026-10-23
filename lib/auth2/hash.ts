// Funciona en Edge y Node (solo Web Crypto).
export async function sha256Hex(texto: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function tokenAleatorio(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
