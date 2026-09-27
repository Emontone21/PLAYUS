"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousUser } from "@/lib/session";
import { selectGroup } from "@/lib/groups-actions";
import { friendlyError } from "@/lib/errors";
import { avatarFromProfile, type Avatar } from "@/avatar/schema";
import { OnboardingForm } from "@/components/onboarding-form";
import { Brand } from "@/components/brand";
import { Lily } from "@/components/lily";

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
    <main className="relative isolate flex min-h-dvh flex-col justify-center gap-8 overflow-x-clip px-5 py-8">
      <Lily size={280} className="-right-24 -top-12" />
      <Brand />
      <header className="flex flex-col gap-2">
        <Link href="/" className="eyebrow">
          volver
        </Link>
        <h1 className="display-lg text-tinta" style={{ fontSize: 40 }}>
          crear un grupo
        </h1>
      </header>

      {state.step === "loading" ? <p>abriendo…</p> : null}
      {state.step === "creating" ? <p>creando…</p> : null}

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
            <span className="eyebrow">¿cómo se llama el grupo?</span>
            <input
              name="groupName"
              autoFocus
              maxLength={40}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="los del barrio"
              className="input"
            />
          </label>
          <button
            type="submit"
            disabled={groupName.trim().length === 0}
            className="btn-primary"
          >
            crear grupo
          </button>
        </form>
      ) : null}

      {state.step === "error" ? (
        <div className="flex flex-col gap-4">
          <p className="note-alert" role="alert" data-testid="flow-error">
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => setState({ step: "group" })}
            className="btn-secondary"
          >
            probar de nuevo
          </button>
        </div>
      ) : null}
    </main>
  );
}
