// Llamadas del panel a /api/admin/{acción}. Devuelven el cuerpo o tiran con
// el mensaje del servidor, para que cada componente muestre el texto tal cual.

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function postAdmin<T = Record<string, unknown>>(action: string, body: Record<string, unknown>): Promise<T & { ok: true }> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new AdminApiError(0, "offline", "no hay conexión. probá de nuevo.");
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
  if (!res.ok || !data.ok) throw new AdminApiError(res.status, data.error ?? "error", data.message ?? "no se pudo.");
  return data as T & { ok: true };
}
