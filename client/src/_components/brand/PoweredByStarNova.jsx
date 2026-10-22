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
  const label = (
    <span className="font-mono-ui text-[10px] font-normal uppercase tracking-[0.14em] text-[var(--text-muted)]">
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
      className={`group flex flex-col items-center gap-1 rounded-lg py-2 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10B981] ${
        collapsed ? "opacity-70" : "opacity-80"
      } ${className}`}
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
