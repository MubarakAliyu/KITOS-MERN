import Image from "next/image";

/**
 * The Kids In Tech logo.
 *
 * Replaces the lightning-bolt placeholder that stood in for the brand while
 * the frontend was built (PRD §12.3). Two variants:
 *
 *   full  the logotype, for an expanded sidebar and the sign-in lockup. It
 *         spells out the name, so it stands in for the wordmark that used to
 *         be set in type beside the icon.
 *   mark  the same logotype letterboxed into a transparent square, for the
 *         collapsed sidebar and the app icons
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
        width={256}
        height={256}
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
