export default function EmailDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="Or sign in with email">
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        Or sign in with email
      </span>
      <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
    </div>
  );
}
