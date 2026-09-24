"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// "tengo un código": normaliza y manda a /g/CODIGO.
export function CodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length === 6) router.push(`/g/${clean}`);
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={8}
        placeholder="código"
        aria-label="código de invitación"
        className="min-w-0 flex-1 rounded-md border-2 border-superficie bg-superficie px-3 py-3 text-lg font-bold uppercase tracking-[0.2em] text-tinta outline-none focus:border-agua"
      />
      <button
        type="submit"
        disabled={clean.length !== 6}
        className="rounded-md border-2 border-agua px-4 py-3 font-extrabold text-agua disabled:opacity-40"
      >
        entrar
      </button>
    </form>
  );
}
