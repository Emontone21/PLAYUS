"use client";

import { useState } from "react";
import { AvatarEditor } from "@/avatar/editor";
import type { Avatar } from "@/avatar/schema";

// La única pantalla entre el link y el grupo: nombre y avatar.
export function OnboardingForm({
  initialName = "",
  initialAvatar,
  submitLabel = "entrar",
  busy = false,
  onSubmit,
}: {
  initialName?: string;
  initialAvatar: Avatar;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (values: { name: string; avatar: Avatar }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<Avatar>(initialAvatar);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 40;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || busy) return;
        void onSubmit({ name: trimmed, avatar });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm text-tinta-suave">¿cómo te llamás?</span>
        <input
          name="name"
          autoFocus
          autoComplete="nickname"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="tu nombre"
          className="rounded-md border-2 border-superficie bg-superficie px-3 py-3 text-lg font-bold text-tinta outline-none focus:border-agua"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-tinta-suave">armá tu avatar</span>
        <AvatarEditor value={avatar} onChange={setAvatar} previewSize={120} />
      </div>

      <button
        type="submit"
        disabled={!valid || busy}
        className="rounded-md bg-oro px-4 py-4 text-lg font-extrabold text-fondo disabled:opacity-40"
      >
        {busy ? "un segundo…" : submitLabel}
      </button>
    </form>
  );
}
