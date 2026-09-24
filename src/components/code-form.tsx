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
        className="input min-w-0 flex-1 uppercase tracking-[0.2em]"
      />
      <button
        type="submit"
        disabled={clean.length !== 6}
        className="btn-secondary"
      >
        entrar
      </button>
    </form>
  );
}
