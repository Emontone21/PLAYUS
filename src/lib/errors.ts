// Traduce los errores conocidos de las RPC a texto para la interfaz.
export function friendlyError(message: string | undefined | null): string {
  if (!message) return "algo salió mal. probá de nuevo.";
  if (message.includes("invalid_invite_code")) return "ese código no existe. fijate si está bien escrito.";
  if (message.includes("invalid_group_name")) return "el nombre del grupo tiene que tener entre 1 y 40 letras.";
  if (message.includes("invalid_timezone")) return "no pudimos leer tu zona horaria.";
  if (message.includes("not_authenticated")) return "se perdió la sesión. recargá la página.";
  if (message.includes("Failed to fetch") || message.includes("fetch failed")) {
    return "no hay conexión. probá de nuevo en un rato.";
  }
  return "algo salió mal. probá de nuevo.";
}
