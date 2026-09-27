"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousUser } from "@/lib/session";
import { selectGroup } from "@/lib/groups-actions";
import { friendlyError } from "@/lib/errors";
import { avatarFromProfile, parseAvatar, type Avatar } from "@/avatar/schema";
import { OnboardingForm } from "@/components/onboarding-form";
import { CodeForm } from "@/components/code-form";
import { Avatar as AvatarView } from "@/components/avatar";
import { Brand } from "@/components/brand";
import { Frog } from "@/components/frog/Frog";
import { Lily } from "@/components/lily";

// "{A} ya está adentro" / "{A} y {B} ya están adentro" / "{A}, {B} y N más ya están adentro"
function insideText({ total, members }: { total: number; members: { name: string }[] }): string {
  const [a, b] = members;
  if (!a) return "";
  if (total === 1) return `${a.name} ya está adentro`;
  if (total === 2 && b) return `${a.name} y ${b.name} ya están adentro`;
  if (b) return `${a.name}, ${b.name} y ${total - 2} más ya están adentro`;
  return `${a.name} y ${total - 1} más ya están adentro`;
}

type State =
  | { step: "loading" }
  | { step: "onboarding"; userId: string; name: string; avatar: Avatar }
  | { step: "confirm"; name: string; avatar: Avatar }
  | { step: "joining" }
  | { step: "error"; message: string };

// 1. sesión anónima automática
// 2. si el perfil no tiene nombre: una pantalla con nombre + avatar;
//    si ya tiene (ya usa la app), confirma antes de sumarlo a otro grupo
// 3. join_group(code) y adentro
type Preview = { total: number; members: { name: string; avatar: Avatar }[] };

export function JoinFlow({ code }: { code: string }) {
  const supabase = useRef(createClient()).current;
  const [state, setState] = useState<State>({ step: "loading" });
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const user = await ensureAnonymousUser(supabase);
        // quiénes ya están adentro (RPC pensada para no-miembros: solo nombre y avatar)
        void supabase.rpc("invite_preview", { p_code: code }).then(({ data }) => {
          if (cancelled || !data) return;
          setPreview({
            total: data.total,
            members: data.members.map((m) => ({ name: m.name, avatar: parseAvatar(m.avatar) })),
          });
        });
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("display_name, avatar")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (cancelled) return;

        const name = profile?.display_name ?? "";
        if (name.trim().length > 0) {
          // RLS solo deja leer los grupos propios: si aparece, ya estás adentro
          // y no hace falta preguntar; si no, es un grupo nuevo y se confirma
          const { data: mine } = await supabase.from("groups").select("id").eq("invite_code", code).maybeSingle();
          if (cancelled) return;
          if (mine) await selectGroup(mine.id, "/grupo");
          else setState({ step: "confirm", name, avatar: avatarFromProfile(profile?.avatar) });
        } else {
          setState({ step: "onboarding", userId: user.id, name, avatar: avatarFromProfile(profile?.avatar) });
        }
      } catch (e) {
        if (!cancelled) setState({ step: "error", message: friendlyError((e as Error).message) });
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function join() {
    setState({ step: "joining" });
    const { data, error } = await supabase.rpc("join_group", { p_code: code });
    if (error || !data) {
      setState({ step: "error", message: friendlyError(error?.message) });
      return;
    }
    await selectGroup(data.id, "/grupo");
  }

  async function saveProfileAndJoin(userId: string, values: { name: string; avatar: Avatar }) {
    setState({ step: "joining" });
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: values.name, avatar: values.avatar });
    if (error) {
      setState({ step: "error", message: friendlyError(error.message) });
      return;
    }
    await join();
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col justify-center gap-8 overflow-x-clip px-5 py-8">
      <Lily size={280} className="-right-24 -top-10" />
      <Lily size={200} className="-left-20 bottom-10 -scale-x-100" />
      <Brand />

      <header className="flex flex-col gap-3">
        {/* las tres ranas agrupadas, arriba del texto */}
        <div className="flex items-end gap-1 pl-1" aria-hidden="true">
          <Frog pose="risa" size={150} tilt={-6} />
          <Frog pose="lengua" size={86} tilt={10} color="#5FCB8F" className="-ml-4 mb-3" />
          <Frog pose="guino" size={64} tilt={-12} color="#B8E04A" className="-ml-3 mb-10" />
        </div>
        <p className="eyebrow">te invitaron a un grupo</p>
        <h1 className="display-lg text-tinta" style={{ fontSize: 40 }}>
          código <span className="tracking-[0.2em] text-luciernaga">{code}</span>
        </h1>
        {preview && preview.total > 0 ? (
          <div className="flex items-center gap-3" data-testid="invite-preview">
            <div className="flex shrink-0">
              {preview.members.map((m, i) => (
                <span key={i} className={i > 0 ? "-ml-3" : ""} style={{ zIndex: preview.members.length - i }}>
                  <AvatarView avatar={m.avatar} name={m.name} size={36} />
                </span>
              ))}
            </div>
            <p className="text-sm">{insideText(preview)}</p>
          </div>
        ) : null}
      </header>

      {state.step === "loading" ? <p>abriendo…</p> : null}
      {state.step === "joining" ? <p>entrando al grupo…</p> : null}

      {state.step === "confirm" ? (
        <section className="flex flex-col gap-5" data-testid="join-confirm">
          <div className="card card-d flex items-center gap-3">
            <AvatarView avatar={state.avatar} name={state.name} size={56} />
            <p className="text-lg text-tinta">
              vas a entrar como <span className="display-bold">{state.name}</span>.
            </p>
          </div>
          <button type="button" onClick={() => void join()} className="btn-primary" data-testid="join-confirm-button">
            entrar al grupo
          </button>
          <Link href="/hoy" className="btn-secondary">
            ahora no
          </Link>
        </section>
      ) : null}

      {state.step === "onboarding" ? (
        <OnboardingForm
          initialName={state.name}
          initialAvatar={state.avatar}
          submitLabel="entrar al grupo"
          onSubmit={(values) => saveProfileAndJoin(state.userId, values)}
        />
      ) : null}

      {state.step === "error" ? (
        <div className="flex flex-col gap-4">
          <p className="note-alert" role="alert" data-testid="flow-error">
            {state.message}
          </p>
          <CodeForm />
        </div>
      ) : null}
    </main>
  );
}
