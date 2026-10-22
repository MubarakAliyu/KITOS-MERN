import { Zap } from "lucide-react";

export default function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#10B981] text-white shadow-sm">
        <Zap className="h-5 w-5" strokeWidth={2.5} fill="currentColor" />
      </div>
      <div className="leading-tight">
        <div className="text-base font-bold text-[#0B1220]">Kids In Tech</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
          Learning Management
        </div>
      </div>
    </div>
  );
}
