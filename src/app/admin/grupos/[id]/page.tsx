import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { loadGroupDetail } from "@/lib/admin-general";
import { createAdminClient } from "@/lib/supabase/admin";
import { readFakeToday } from "@/lib/api";
import { formatDateTime, formatShortDate } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { DangerAction } from "../../_components/danger-action";
import { TestSwitch } from "../../_components/test-switch";
import { MemberActions } from "./member-actions";

export const dynamic = "force-dynamic";

// /admin/grupos/{id}: integrantes (nombre, apodo, rol, ingreso, email
// vinculado, partidas de la temporada actual) con sacar y hacer dueño;
// reiniciar la temporada; borrar el grupo.
export default async function AdminGroupPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await loadGroupDetail(createAdminClient(), id, await readFakeToday());
  if (!detail) notFound();
  const { group, members, seasons, currentSeason } = detail;
  const owner = members.find((m) => m.role === "owner");
  return (
    <main className="flex flex-col gap-6" data-testid="admin-group-detail" data-group-id={group.id}>
      <p>
        <Link href="/admin/grupos" className="text-xs text-tinta-suave underline">
          ← grupos
        </Link>
      </p>
      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="display text-2xl text-tinta" data-testid="admin-group-name">
            {group.name}
          </h2>
          <TestSwitch groupId={group.id} isTest={group.is_test} />
        </div>
        {!group.is_test ? (
          <p className="note-alert text-sm" data-testid="admin-group-real">
            este grupo no está marcado como de prueba: lo que se borre acá es de verdad.
          </p>
        ) : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-tinta-suave">código</dt>
          <dd className="display-bold text-tinta">{group.invite_code}</dd>
          <dt className="text-tinta-suave">zona</dt>
          <dd>
            {group.timezone}, hoy {formatShortDate(detail.today)}
          </dd>
          <dt className="text-tinta-suave">hoy</dt>
          <dd data-testid="admin-group-game">{detail.round ? detail.round.gameName : "todavía no se creó"}</dd>
          <dt className="text-tinta-suave">temporada</dt>
          <dd data-testid="admin-group-season">{currentSeason ? `${currentSeason.number}, día ${currentSeason.day} de 30 (del ${currentSeason.startsOn} al ${currentSeason.endsOn ?? "?"})` : "todavía no empezó"}</dd>
          <dt className="text-tinta-suave">creado</dt>
          <dd>{formatDateTime(group.created_at)}</dd>
        </dl>
        <p className="text-xs text-tinta-suave">
          para cambiar el juego de hoy, usá la pestaña <Link href="/admin" className="underline">hoy</Link>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="display text-xl text-tinta">integrantes</h3>
          <span className="eyebrow">{members.length}</span>
        </div>
        <ul className="flex flex-col gap-3" data-testid="admin-members">
          {members.map((m) => (
            <li key={m.profileId} className="card-b card flex flex-col gap-2" data-testid="admin-member" data-profile-id={m.profileId} data-role={m.role}>
              <div className="flex items-center gap-3">
                <Avatar avatar={m.avatar} name={m.name} size={40} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="display text-base text-tinta">
                    <Link href={`/admin/usuarios/${m.profileId}`} className="underline-offset-4 hover:underline">
                      {m.displayName || "(sin nombre)"}
                    </Link>
                    {m.nickname ? <span className="text-tinta-suave"> · {m.nickname}</span> : null}
                  </span>
                  <span className="text-xs text-tinta-suave">
                    {m.role === "owner" ? "dueño" : "integrante"} · entró {formatDateTime(m.joinedAt)} · {m.hasEmail ? "con email" : "anónimo"} · {m.played} {m.played === 1 ? "partida" : "partidas"} esta temporada
                  </span>
                </div>
              </div>
              <MemberActions groupId={group.id} groupName={group.name} member={{ profileId: m.profileId, name: m.name, role: m.role }} />
            </li>
          ))}
        </ul>
        {owner ? null : <p className="text-sm text-lengua">este grupo no tiene dueño.</p>}
      </section>

      <section className="flex flex-col gap-2" data-testid="admin-reset-season-section">
        <h3 className="display text-xl text-tinta">reiniciar la temporada</h3>
        <p className="text-xs text-tinta-suave">borra todas las rondas e intentos de la temporada actual y la vuelve a empezar desde hoy, con el mismo número. las temporadas cerradas, sus campeones y la corona no se tocan.</p>
        <DangerAction action="reset-season" payload={{ groupId: group.id }} label="reiniciar la temporada" word="reiniciar" wordHint='para confirmar, escribí "reiniciar"' testId="admin-reset" disabled={!currentSeason} disabledText="todavía no hay temporada que reiniciar." />
        {seasons.length > 0 ? (
          <ul className="mt-2 flex flex-col text-sm" data-testid="admin-seasons">
            {seasons.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 py-1" style={{ borderBottom: "2px solid var(--superficie-2)" }} data-testid="admin-season" data-number={s.number}>
                <span>
                  temporada {s.number}: {s.startsOn} a {s.endsOn ?? "?"}
                  {s.closedAt ? " (cerrada)" : " (en curso)"}
                </span>
                <span className="text-tinta-suave">
                  {s.rounds} rondas, {s.attempts} intentos
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-2" data-testid="admin-delete-group-section">
        <h3 className="display text-xl text-tinta">borrar el grupo</h3>
        <p className="text-xs text-tinta-suave">se borra con todo lo suyo: integrantes, temporadas, rondas e intentos. los usuarios siguen existiendo salvo que marques la opción.</p>
        <DangerAction
          action="delete-group"
          payload={{ groupId: group.id }}
          label="borrar el grupo"
          word={group.name}
          wordHint={`para confirmar, escribí el nombre del grupo (${group.name})`}
          option={{ key: "deleteOrphans", label: "también borrar a los usuarios que quedan sin ningún grupo", initial: group.is_test }}
          afterHref="/admin/grupos"
          testId="admin-delete-group"
        />
      </section>
    </main>
  );
}
