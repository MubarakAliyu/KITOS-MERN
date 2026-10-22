import Image from "next/image";

/**
 * The Kids In Tech logo.
 *
 * Replaces the lightning-bolt placeholder that stood in for the brand while
 * the frontend was built (PRD §12.3). Two variants:
 *
 *   full  the wordmark, for an expanded sidebar and the sign-in lockup
 *   mark  the square "<" bracket, for the collapsed sidebar and anywhere
 *         else the slot is square — the wordmark is 2.1:1 and turns to mush
 *         below about 80px wide
 *
 * Both files come from `scripts/prepare-brand.mjs`. Width and height are the
 * assets' intrinsic sizes so Next.js can reserve the space and nothing shifts
 * as the image loads; the rendered size comes from `className`.
 */
export default function KitLogo({
  variant = "full",
  className = "",
  priority = false,
}) {
  if (variant === "mark") {
    return (
      <Image
        src="/brand/kit-mark.png"
        alt="Kids In Tech"
        width={128}
        height={128}
        priority={priority}
        className={className}
      />
    );
  }

  return (
    <Image
      src="/brand/kit-logo.png"
      alt="Kids In Tech"
      width={600}
      height={279}
      priority={priority}
      className={className}
    />
  );
}
