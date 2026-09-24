"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { avatarSchema, type Avatar } from "@/avatar/schema";
import { AvatarEditor } from "@/avatar/editor";

export function ProfileEditor({
  userId,
  initialName,
  initialAvatar,
}: {
  userId: string;
  initialName: string;
  initialAvatar: Avatar;
}) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<Avatar>(initialAvatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 40;

  async function save() {
    if (!valid || busy) return;
    const parsed = avatarSchema.safeParse(avatar);
    if (!parsed.success) {
      setError("el avatar quedó mal armado. tocá 'al azar' y probá de nuevo.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: trimmed, avatar: parsed.data })
      .eq("id", userId);
    setBusy(false);
    if (error) {
      setError(friendlyError(error.message));
      return;
    }
    router.push("/perfil");
    router.refresh();
  }

  return (
    <main className="flex flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <Link href="/perfil" className="text-sm text-tinta-suave">
          ← perfil
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">tu nombre y tu avatar</h1>
      </header>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm text-tinta-suave">nombre visible</span>
          <input
            name="name"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="tu nombre"
            className="rounded-md border-2 border-superficie bg-superficie px-3 py-3 text-lg font-bold text-tinta outline-none focus:border-agua"
          />
        </label>

        <AvatarEditor value={avatar} onChange={setAvatar} />

        {error ? (
          <p className="rounded-md border-l-4 border-rosa bg-superficie px-4 py-3" role="status" data-testid="flow-error">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!valid || busy}
          className="rounded-md bg-oro px-4 py-4 text-lg font-extrabold text-fondo disabled:opacity-40"
        >
          {busy ? "guardando…" : "guardar cambios"}
        </button>
      </form>
    </main>
  );
}
