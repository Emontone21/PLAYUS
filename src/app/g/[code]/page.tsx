import { JoinFlow } from "./join-flow";

// Link de invitación. Toda la lógica es de cliente porque abrir la sesión
// anónima escribe cookies, y eso un Server Component no lo puede hacer.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinFlow code={code.toUpperCase()} />;
}
