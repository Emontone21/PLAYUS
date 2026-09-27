"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousUser } from "@/lib/session";
import { selectGroup } from "@/lib/groups-actions";
import { friendlyError } from "@/lib/errors";
import { avatarFromProfile, type Avatar } from "@/avatar/schema";
import { OnboardingForm } from "@/components/onboarding-form";
import { CodeForm } from "@/components/code-form";
import { Avatar as AvatarView } from "@/components/avatar";

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
export function JoinFlow({ code }: { code: string }) {
  const supabase = useRef(createClient()).current;
  const [state, setState] = useState<State>({ step: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const user = await ensureAnonymousUser(supabase);
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
    <main className="flex min-h-dvh flex-col justify-center gap-8 px-5 py-10">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">te invitaron a un grupo</p>
        <h1 className="display text-4xl">
          código <span className="tracking-[0.2em] text-oro">{code}</span>
        </h1>
      </header>

      {state.step === "loading" ? <p className="text-tinta-suave">abriendo…</p> : null}
      {state.step === "joining" ? <p className="text-tinta-suave">entrando al grupo…</p> : null}

      {state.step === "confirm" ? (
        <section className="flex flex-col gap-5" data-testid="join-confirm">
          <div className="flex items-center gap-3">
            <AvatarView avatar={state.avatar} name={state.name} size={56} />
            <p className="text-lg">
              vas a entrar como <span className="font-bold">{state.name}</span>.
            </p>
          </div>
          <button type="button" onClick={() => void join()} className="btn-primary" data-testid="join-confirm-button">
            entrar al grupo
          </button>
          <Link href="/hoy" className="btn-quiet text-center">
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
