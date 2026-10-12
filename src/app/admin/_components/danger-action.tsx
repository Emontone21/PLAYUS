"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Preview } from "@/lib/admin-general";
import { AdminApiError, postAdmin } from "./api";

// Toda acción destructiva del panel pasa por acá, en tres pasos:
//   1. vista previa: el servidor calcula exactamente qué se va a borrar, con
//      cantidades (la misma función que después borra, en modo dryRun);
//   2. confirmación fuerte: hay que escribir una palabra o el nombre del grupo
//      para que se habilite el botón, que va en --lengua;
//   3. la acción, en una transacción, que queda en el registro.
// Si la vista previa toca grupos no marcados como prueba, se avisa siempre.

export interface DangerOption {
  key: string;
  label: string;
  initial: boolean;
}

type Step = { kind: "idle" } | { kind: "loading" } | { kind: "preview"; preview: Preview } | { kind: "sending"; preview: Preview } | { kind: "done"; summary: string } | { kind: "error"; text: string; preview?: Preview };

export function DangerAction({
  action,
  payload = {},
  label,
  word,
  wordHint,
  option,
  afterHref,
  testId,
  disabled = false,
  disabledText,
  small = false,
}: {
  /** la acción de /api/admin/{acción} */
  action: string;
  payload?: Record<string, unknown>;
  /** el texto del botón */
  label: string;
  /** la palabra o el nombre que hay que escribir */
  word: string;
  /** qué pedir: "escribí borrar" o "escribí el nombre del grupo" */
  wordHint: string;
  option?: DangerOption;
  /** a dónde ir cuando terminó (si no, se refresca la página) */
  afterHref?: string;
  testId: string;
  disabled?: boolean;
  disabledText?: string;
  small?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [checked, setChecked] = useState(option?.initial ?? false);
  const [typed, setTyped] = useState("");
  const body = () => ({ ...payload, ...(option ? { [option.key]: checked } : {}) });

  async function preview(withChecked = checked) {
    setStep({ kind: "loading" });
    try {
      const res = await postAdmin<{ preview: Preview }>(action, { ...payload, ...(option ? { [option.key]: withChecked } : {}), dryRun: true });
      setStep({ kind: "preview", preview: res.preview });
    } catch (e) {
      setStep({ kind: "error", text: e instanceof AdminApiError ? e.message : "no se pudo calcular la vista previa." });
    }
  }

  async function confirm() {
    if (step.kind !== "preview") return;
    const p = step.preview;
    setStep({ kind: "sending", preview: p });
    try {
      const res = await postAdmin<{ summary: string }>(action, body());
      setStep({ kind: "done", summary: res.summary });
      setTyped("");
      router.refresh();
    } catch (e) {
      setStep({ kind: "error", text: e instanceof AdminApiError ? e.message : "no se pudo.", preview: p });
    }
  }

  useEffect(() => {
    if (step.kind !== "done" || !afterHref) return;
    const t = setTimeout(() => router.push(afterHref), 1500);
    return () => clearTimeout(t);
  }, [step, afterHref, router]);

  const matches = typed.trim().toLowerCase() === word.trim().toLowerCase();
  const current = step.kind === "preview" || step.kind === "sending" ? step.preview : step.kind === "error" ? step.preview : undefined;

  if (disabled) {
    return (
      <p className="text-sm text-tinta-suave" data-testid={`${testId}-disabled`}>
        {disabledText ?? "no se puede."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`${testId}-wrap`}>
      {step.kind === "idle" || step.kind === "loading" || (step.kind === "error" && !step.preview) ? (
        <div className="flex flex-col gap-2">
          <button type="button" className={small ? "btn-primary-sm w-fit" : "btn-primary-sm w-full"} style={{ background: "var(--lengua)", color: "var(--contorno)" }} onClick={() => void preview()} disabled={step.kind === "loading"} data-testid={testId}>
            {step.kind === "loading" ? "calculando…" : label}
          </button>
          {step.kind === "error" ? (
            <p className="text-sm text-lengua" role="alert" data-testid={`${testId}-error`}>
              {step.text}
            </p>
          ) : null}
        </div>
      ) : null}

      {current && step.kind !== "done" ? (
        <div className="card-c card flex flex-col gap-3" data-testid={`${testId}-preview`}>
          <p className="eyebrow">vista previa</p>
          <ul className="flex flex-col gap-1 text-sm">
            {current.lines.map((l, i) => (
              <li key={i} className="text-tinta" data-testid={`${testId}-line`}>
                {l}
              </li>
            ))}
          </ul>
          {option ? (
            <label className="flex items-start gap-2 text-sm text-tinta">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--rana)]"
                checked={checked}
                disabled={step.kind === "sending"}
                onChange={(e) => {
                  setChecked(e.target.checked);
                  void preview(e.target.checked);
                }}
                data-testid={`${testId}-option`}
              />
              <span>{option.label}</span>
            </label>
          ) : null}
          {current.warning ? (
            <p className="note-alert text-sm" data-testid={`${testId}-warning`}>
              {current.warning}
            </p>
          ) : null}
          {current.blocked ? (
            <div className="note text-sm" data-testid={`${testId}-blocked`}>
              <p>{current.blocked.text}</p>
              {current.blocked.links.length > 0 ? (
                <p className="mt-1 flex flex-wrap gap-2">
                  {current.blocked.links.map((l) => (
                    <Link key={l.href} href={l.href} className="chip text-xs">
                      {l.label} →
                    </Link>
                  ))}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs text-tinta-suave">
                {wordHint}
                <input className="input-sm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={step.kind === "sending"} data-testid={`${testId}-word`} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary-sm" style={{ background: "var(--lengua)", color: "var(--contorno)" }} onClick={() => void confirm()} disabled={!matches || step.kind === "sending"} data-testid={`${testId}-confirm`}>
                  {step.kind === "sending" ? "haciendo…" : label}
                </button>
                <button type="button" className="btn-secondary-sm" onClick={() => setStep({ kind: "idle" })} disabled={step.kind === "sending"} data-testid={`${testId}-cancel`}>
                  no
                </button>
              </div>
            </>
          )}
          {step.kind === "error" ? (
            <p className="text-sm text-lengua" role="alert" data-testid={`${testId}-error`}>
              {step.text}
            </p>
          ) : null}
        </div>
      ) : null}

      {step.kind === "done" ? (
        <p className="note-ok text-sm" role="status" data-testid={`${testId}-done`}>
          {step.summary}
          {afterHref ? (
            <>
              {" "}
              <Link href={afterHref} className="underline">
                volver
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
