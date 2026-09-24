// Next memoiza los fetch GET idénticos (misma URL y opciones) dentro de un
// mismo render. Con Supabase eso es un problema: "¿existe la ronda de hoy?"
// → no → la creo → "¿existe?" devolvería el "no" memoizado. Pasar un signal
// propio en cada llamada es la forma documentada de salir de la memoización,
// y cache: "no-store" evita además el Data Cache.
export const uncachedFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? new AbortController().signal,
  });
