"use client";

// Un interruptor con el estilo de Frog: píldora con contorno y una perilla
// que se corre. Accesible como role="switch".

export function Switch({ checked, onChange, label, busy = false, disabled = false, testId }: { checked: boolean; onChange: (next: boolean) => void; label: string; busy?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy || disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex shrink-0 items-center gap-2 disabled:opacity-50"
      data-testid={testId}
      data-checked={checked ? "1" : "0"}
    >
      <span className="relative inline-block h-7 w-12 rounded-full transition-colors" style={{ background: checked ? "var(--rana)" : "var(--superficie-2)", border: "3px solid var(--contorno)" }}>
        <span className="absolute top-[2px] h-[18px] w-[18px] rounded-full transition-[left]" style={{ left: checked ? 22 : 2, background: "var(--contorno)" }} />
      </span>
      <span className="display-bold text-sm text-tinta">{label}</span>
    </button>
  );
}
