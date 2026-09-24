"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { AVATAR_BACKGROUNDS, type ProvisionalAvatar } from "@/lib/avatar";

// La única pantalla entre el link y el grupo: nombre y avatar provisorio.
export function OnboardingForm({
  initialName = "",
  initialAvatar,
  submitLabel = "entrar",
  busy = false,
  onSubmit,
}: {
  initialName?: string;
  initialAvatar?: ProvisionalAvatar;
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (values: { name: string; avatar: ProvisionalAvatar }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<ProvisionalAvatar>(
    initialAvatar ?? { bg: AVATAR_BACKGROUNDS[0] },
  );
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
      <div className="flex items-center gap-4">
        <Avatar avatar={avatar} name={trimmed} size={72} />
        <label className="flex flex-1 flex-col gap-1">
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
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-tinta-suave">elegí un color (el avatar de verdad llega después)</span>
        <div className="grid grid-cols-8 gap-2" role="radiogroup" aria-label="color del avatar">
          {AVATAR_BACKGROUNDS.map((bg) => {
            const selected = bg === avatar.bg;
            return (
              <button
                key={bg}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={bg}
                onClick={() => setAvatar({ bg })}
                className="aspect-square rounded-full border-4"
                style={{ background: bg, borderColor: selected ? "#f5f3ff" : "transparent" }}
              />
            );
          })}
        </div>
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
