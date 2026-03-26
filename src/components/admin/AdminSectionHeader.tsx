import { ReactNode } from "react";

type SummaryChip = {
  label: string;
  value: string;
  tone?: "primary" | "accent" | "neutral" | "danger";
};

type AdminSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  summary?: SummaryChip[];
  actions?: ReactNode;
};

function toneClasses(tone: SummaryChip["tone"]): string {
  if (tone === "accent") return "border-accent/20 bg-accent/10 text-accent";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "neutral") return "border-zinc-200 bg-white text-zinc-600";
  return "border-primary/15 bg-primary/10 text-primary";
}

export function AdminSectionHeader({
  eyebrow,
  title,
  description,
  summary = [],
  actions,
}: AdminSectionHeaderProps) {
  return (
    <div className="rounded-[32px] border border-primary/10 bg-white/85 p-6 shadow-md backdrop-blur">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            {eyebrow}
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">{description}</p>
        </div>

        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      {summary.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {summary.map((item) => (
            <div key={`${item.label}-${item.value}`} className={`rounded-full border px-3 py-2 text-sm ${toneClasses(item.tone)}`}>
              <span className="font-semibold">{item.value}</span>
              <span className="ml-2 text-xs uppercase tracking-[0.18em] opacity-80">{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
