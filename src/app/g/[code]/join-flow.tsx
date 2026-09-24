"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousUser } from "@/lib/session";
import { selectGroup } from "@/lib/groups-actions";
import { friendlyError } from "@/lib/errors";
import { avatarFromProfile, type Avatar } from "@/avatar/schema";
import { OnboardingForm } from "@/components/onboarding-form";
import { CodeForm } from "@/components/code-form";

type State =
  | { step: "loading" }
  | { step: "onboarding"; userId: string; name: string; avatar: Avatar }
  | { step: "joining" }
  | { step: "error"; message: string };

// 1. sesión anónima automática
// 2. si el perfil no tiene nombre: una pantalla con nombre + avatar
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
          await join();
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
        <p className="text-sm text-tinta-suave">te invitaron a un grupo</p>
        <h1 className="text-4xl font-extrabold tracking-tight">
          código <span className="tracking-[0.2em] text-oro">{code}</span>
        </h1>
      </header>

      {state.step === "loading" ? <p className="text-tinta-suave">abriendo…</p> : null}
      {state.step === "joining" ? <p className="text-tinta-suave">entrando al grupo…</p> : null}

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
          <p className="rounded-md border-l-4 border-rosa bg-superficie px-4 py-3" role="alert" data-testid="flow-error">
            {state.message}
          </p>
          <CodeForm />
        </div>
      ) : null}
    </main>
  );
}
