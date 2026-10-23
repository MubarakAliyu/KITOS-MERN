import KitLogo from "@/_components/brand/KitLogo";

export default function BrandLockup() {
  return (
    <div className="flex flex-col items-start gap-1.5">
      {/* The logotype spells out "Kids In Tech", so it replaces both the old
          bolt icon and the wordmark that was set in type beside it. The
          caption stays, stacked underneath. */}
      <KitLogo variant="full" className="h-11 w-auto object-contain" priority />
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B7280]">
        Learning Management
      </div>
    </div>
  );
}
