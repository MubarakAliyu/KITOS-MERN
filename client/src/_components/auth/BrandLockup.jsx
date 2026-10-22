import KitLogo from "@/_components/brand/KitLogo";

export default function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      {/* The Kids In Tech logo, in the slot the lightning-bolt placeholder
          used to fill. Same 40px square footprint and the same gap, so the
          lockup's spacing is unchanged. */}
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0B1220] p-1.5 shadow-sm">
        <KitLogo variant="mark" className="h-full w-full object-contain" priority />
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
