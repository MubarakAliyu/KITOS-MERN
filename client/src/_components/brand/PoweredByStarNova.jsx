import Image from "next/image";

/**
 * "Powered by StarNova Labs" attribution (PRD §12.4).
 *
 * Appears at the very bottom of the sidebar and at the foot of the sign-in
 * page's form panel.
 *
 * `ink` picks the wordmark:
 *
 *   auto   render both and let a `dark:` class choose. next-themes cannot
 *          know the theme during server rendering, so choosing in JavaScript
 *          would paint the light mark first and swap it after hydration — a
 *          visible flash on every load. CSS decides before the first paint
 *          instead, and the hidden copy costs nothing: these are 3.5 KB SVGs.
 *   dark   force the dark wordmark. The auth pages render their form panel
 *          on `bg-white` whatever the theme is, so `auto` would put the white
 *          wordmark on a white panel and make it vanish for anyone whose
 *          theme is dark.
 *
 * `collapsed` shows the square logomark alone, for the collapsed sidebar.
 */
export default function PoweredByStarNova({
  collapsed = false,
  ink = "auto",
  className = "",
}) {
  // --text-secondary, not --text-muted.
  //
  // The brand note asked for --text-muted, but that token fails WCAG AA
  // against the sidebar in both themes (#9ca3af on white is 2.5:1, #6b7280 on
  // #0f1729 is 3.7:1, against the 4.5:1 small text needs). --text-secondary is
  // the next step up, reads as the same quiet grey, and passes in both
  // (4.83:1 and about 7:1). A credit nobody can read serves nobody.
  const label = (
    <span className="font-mono-ui text-[10px] font-normal uppercase tracking-[0.14em] text-[var(--text-secondary)]">
      Powered by
    </span>
  );

  // 17px tall, inside the 16–18px the brand note allows.
  const markHeight = "h-[17px] w-auto";

  return (
    <a
      href="https://www.starnovalabs.com"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Powered by StarNova Labs"
      title={collapsed ? "Powered by StarNova Labs" : undefined}
      className={`group flex flex-col items-center gap-1 rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10B981] ${className}`}
    >
      {collapsed ? (
        <Image
          src="/brand/starnova-mark.svg"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5"
        />
      ) : ink === "dark" ? (
        <>
          {/* Always-light surface: force the dark wordmark. */}
          {/* #6B7280 on the always-white auth panel is 4.83:1. */}
          <span className="font-mono-ui text-[10px] font-normal uppercase tracking-[0.14em] text-[#6B7280]">
            Powered by
          </span>
          <Image
            src="/brand/starnova-logo-dark.svg"
            alt="StarNova Labs"
            width={390}
            height={54}
            className={markHeight}
          />
        </>
      ) : (
        <>
          {label}
          {/* Dark ink for the light theme. */}
          <Image
            src="/brand/starnova-logo-dark.svg"
            alt="StarNova Labs"
            width={390}
            height={54}
            className={`${markHeight} dark:hidden`}
          />
          {/* White ink for the dark theme. */}
          <Image
            src="/brand/starnova-logo-light.svg"
            alt="StarNova Labs"
            width={390}
            height={54}
            className={`hidden ${markHeight} dark:block`}
          />
        </>
      )}
    </a>
  );
}
