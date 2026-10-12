"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminApiError, postAdmin } from "./api";
import { Switch } from "./switch";

// El interruptor "de prueba" de un grupo.
export function TestSwitch({ groupId, isTest }: { groupId: string; isTest: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(isTest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function change(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await postAdmin<{ isTest: boolean }>("group-test", { groupId, isTest: next });
      setChecked(res.isTest);
      router.refresh();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "no se pudo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Switch checked={checked} onChange={(n) => void change(n)} label="de prueba" busy={busy} testId="admin-test-switch" />
      {error ? (
        <p className="text-xs text-lengua" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
