"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";

type Row = { id: string; name: string; nickname: string | null };

// Un campo por grupo. Guarda con blur o enter sobre group_members.nickname,
// la única columna de la membresía que el cliente puede tocar.
export function Nicknames({ groups }: { groups: Row[] }) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(groups.map((g) => [g.id, g.nickname ?? ""])),
  );
  const [status, setStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});
  const [message, setMessage] = useState<string | null>(null);

  async function save(groupId: string) {
    const original = groups.find((g) => g.id === groupId)?.nickname ?? "";
    const next = (values[groupId] ?? "").trim();
    if (next === original) return;
    setStatus((s) => ({ ...s, [groupId]: "saving" }));
    const { error } = await supabase
      .from("group_members")
      .update({ nickname: next.length ? next : null })
      .eq("group_id", groupId);
    if (error) {
      setStatus((s) => ({ ...s, [groupId]: "error" }));
      setMessage(friendlyError(error.message));
      return;
    }
    setStatus((s) => ({ ...s, [groupId]: "saved" }));
    setMessage(null);
    router.refresh();
    setTimeout(() => setStatus((s) => ({ ...s, [groupId]: "idle" })), 2000);
  }

  return (
    <ul className="flex flex-col gap-3">
      {groups.map((g) => (
        <li key={g.id} className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="text-sm">en {g.name}</span>
            <div className="flex items-center gap-2">
              <input
                value={values[g.id] ?? ""}
                maxLength={40}
                onChange={(e) => setValues((v) => ({ ...v, [g.id]: e.target.value }))}
                onBlur={() => void save(g.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="tu nombre"
                aria-label={`apodo en ${g.name}`}
                className="input-sm min-w-0 flex-1"
              />
              <span className="w-16 text-right text-xs text-tinta-suave" aria-live="polite">
                {status[g.id] === "saving" ? "guardando" : status[g.id] === "saved" ? "guardado" : ""}
              </span>
            </div>
          </label>
        </li>
      ))}
      {message ? (
        <li className="note-alert text-sm" role="status">
          {message}
        </li>
      ) : null}
    </ul>
  );
}
