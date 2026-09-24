"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousUser } from "@/lib/session";
import { selectGroup } from "@/lib/groups-actions";
import { friendlyError } from "@/lib/errors";
import { avatarFromProfile, type Avatar } from "@/avatar/schema";
import { OnboardingForm } from "@/components/onboarding-form";

type State =
  | { step: "loading" }
  | { step: "onboarding"; userId: string; name: string; avatar: Avatar }
  | { step: "group" }
  | { step: "creating" }
  | { step: "error"; message: string };

const DEFAULT_TZ = "America/Montevideo";

// Crear grupo: sesión anónima → (nombre + avatar si faltan) → nombre del grupo.
export function CreateFlow() {
  const supabase = useRef(createClient()).current;
  const [state, setState] = useState<State>({ step: "loading" });
  const [groupName, setGroupName] = useState("");

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
          setState({ step: "group" });
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
  }, []);

  async function saveProfile(userId: string, values: { name: string; avatar: Avatar }) {
    setState({ step: "creating" });
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: values.name, avatar: values.avatar });
    if (error) {
      setState({ step: "error", message: friendlyError(error.message) });
      return;
    }
    setState({ step: "group" });
  }

  async function create() {
    const name = groupName.trim();
    if (name.length < 1 || name.length > 40) return;
    setState({ step: "creating" });

    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
    let result = await supabase.rpc("create_group", { p_name: name, p_timezone: browserTz });
    if (result.error?.message.includes("invalid_timezone")) {
      result = await supabase.rpc("create_group", { p_name: name, p_timezone: DEFAULT_TZ });
    }
    if (result.error || !result.data) {
      setState({ step: "error", message: friendlyError(result.error?.message) });
      return;
    }
    await selectGroup(result.data.id, "/grupo");
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 px-5 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-tinta-suave">
          ← volver
        </Link>
        <h1 className="text-4xl font-extrabold tracking-tight">crear un grupo</h1>
      </header>

      {state.step === "loading" ? <p className="text-tinta-suave">abriendo…</p> : null}
      {state.step === "creating" ? <p className="text-tinta-suave">creando…</p> : null}

      {state.step === "onboarding" ? (
        <OnboardingForm
          initialName={state.name}
          initialAvatar={state.avatar}
          submitLabel="seguir"
          onSubmit={(values) => saveProfile(state.userId, values)}
        />
      ) : null}

      {state.step === "group" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm text-tinta-suave">¿cómo se llama el grupo?</span>
            <input
              name="groupName"
              autoFocus
              maxLength={40}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="los del barrio"
              className="rounded-md border-2 border-superficie bg-superficie px-3 py-3 text-lg font-bold text-tinta outline-none focus:border-agua"
            />
          </label>
          <button
            type="submit"
            disabled={groupName.trim().length === 0}
            className="rounded-md bg-oro px-4 py-4 text-lg font-extrabold text-fondo disabled:opacity-40"
          >
            crear grupo
          </button>
        </form>
      ) : null}

      {state.step === "error" ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-md border-l-4 border-rosa bg-superficie px-4 py-3" role="alert" data-testid="flow-error">
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => setState({ step: "group" })}
            className="rounded-md border-2 border-agua px-4 py-3 font-extrabold text-agua"
          >
            probar de nuevo
          </button>
        </div>
      ) : null}
    </main>
  );
}
