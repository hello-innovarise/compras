"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decline, uploadDoc } from "./actions";

export function DocUpload({ token, kind, label, uploaded, editable, uploadText }: { token: string; kind: string; label: string; uploaded: string[]; editable: boolean; uploadText: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="flex flex-wrap items-center gap-2 py-1">
      <span className={uploaded.length ? "text-green-700" : ""}>{uploaded.length ? "✔" : "○"} {label}</span>
      {uploaded.length > 0 && <span className="text-xs text-gray-500">({uploaded.join(", ")})</span>}
      {editable && (
        <form
          className="ml-auto flex items-center gap-1"
          action={(fd) =>
            start(async () => {
              const r = await uploadDoc(token, fd);
              setErr(r.error ?? null);
              router.refresh();
            })
          }
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="file" name="file" className="text-xs" />
          <button className="btn-secondary btn-sm" disabled={pending}>{uploadText}</button>
        </form>
      )}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </li>
  );
}

export function Decline({ token, label, reasonLabel }: { token: string; label: string; reasonLabel: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button className="text-sm text-red-700 underline" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <div className="flex items-center gap-2">
      <input className="input max-w-sm" placeholder={reasonLabel} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-danger" disabled={pending} onClick={() => start(async () => { await decline(token, reason); router.refresh(); })}>{label}</button>
    </div>
  );
}
