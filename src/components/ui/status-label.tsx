import { Check, CircleAlert, LoaderCircle } from "lucide-react";

export function StatusLabel({
  tone,
  children,
}: {
  tone: "neutral" | "pass" | "fail" | "busy";
  children: React.ReactNode;
}) {
  const Icon = tone === "pass" ? Check : tone === "fail" ? CircleAlert : tone === "busy" ? LoaderCircle : null;
  return (
    <span className={`status-label status-label--${tone}`}>
      {Icon ? <Icon size={14} aria-hidden="true" className={tone === "busy" ? "spin" : undefined} /> : null}
      {children}
    </span>
  );
}
