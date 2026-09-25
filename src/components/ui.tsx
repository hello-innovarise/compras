import Link from "next/link";

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Borrador", cls: "bg-gray-200 text-gray-700" },
  OPEN: { label: "Abierta", cls: "bg-green-100 text-green-800" },
  CLOSED: { label: "Cerrada", cls: "bg-amber-100 text-amber-800" },
  AWARDED: { label: "Adjudicada", cls: "bg-blue-100 text-blue-800" },
  CANCELLED: { label: "Cancelada", cls: "bg-red-100 text-red-700" },
  PENDING: { label: "Sin enviar", cls: "bg-gray-200 text-gray-700" },
  SENT: { label: "Enviada", cls: "bg-sky-100 text-sky-800" },
  VIEWED: { label: "Vista", cls: "bg-indigo-100 text-indigo-800" },
  DECLINED: { label: "Declinó", cls: "bg-red-100 text-red-700" },
  SUBMITTED: { label: "Ofertó", cls: "bg-green-100 text-green-800" },
  IN_SESSION: { label: "En sesión", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Aprobada", cls: "bg-blue-100 text-blue-800" },
};

export function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-gray-200">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`tab ${t.key === active ? "tab-active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  return <div className={`mb-4 rounded-md p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{error ?? msg}</div>;
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">{children}</p>;
}
