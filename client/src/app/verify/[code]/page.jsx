import Link from "next/link";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import KitLogo from "@/_components/brand/KitLogo";
import PoweredByStarNova from "@/_components/brand/PoweredByStarNova";

/**
 * Public certificate verification (FR11).
 *
 * The page a stranger lands on from the code printed on a certificate — an
 * employer, a secondary school, a parent checking a tutor's claim. No
 * sign-in, and deliberately little information: initials, the course and the
 * date. Enough to confirm the certificate is real, never enough to identify
 * a child.
 *
 * Server-rendered so the answer is in the HTML: this is a page people will
 * screenshot, and it should not depend on JavaScript running.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verify a certificate",
  description: "Check that a Kids In Tech certificate is genuine.",
};

async function verify(code) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  try {
    const response = await fetch(
      `${base}/certificates/verify/${encodeURIComponent(code)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return { valid: false };
    return response.json();
  } catch {
    // The API being unreachable is not the same as a certificate being fake,
    // and saying "not valid" would be a lie.
    return { unreachable: true };
  }
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-[var(--border-color)] py-3 first:border-t-0">
      <dt className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

export default async function VerifyCertificatePage({ params }) {
  const { code } = await params;
  const result = await verify(code);

  const issued = result.issued_at
    ? new Date(result.issued_at).toLocaleDateString("en-GB", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Africa/Lagos",
      })
    : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-secondary)] px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <KitLogo variant="full" className="h-12 w-auto object-contain" priority />
        </div>

        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-sm">
          {result.unreachable ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <ShieldAlert className="h-10 w-10 text-amber-500" />
              <h1 className="text-lg font-bold text-[var(--text-primary)]">
                We could not check this right now
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                The verification service is unavailable. This does not mean the
                certificate is invalid — please try again shortly.
              </p>
            </div>
          ) : result.valid ? (
            <>
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#10B981]/10">
                  <BadgeCheck className="h-7 w-7 text-[#10B981]" />
                </span>
                <h1 className="text-lg font-bold text-[var(--text-primary)]">
                  This certificate is genuine
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Issued by Kids In Tech, a programme of StarNova Labs.
                </p>
              </div>

              <dl className="mt-6">
                <Row label="Awarded to" value={result.student_initials ?? "—"} />
                <Row label="Course" value={result.course_title} />
                <Row label="Issued" value={issued ?? "—"} />
                <Row label="Serial" value={result.serial} />
              </dl>

              <p className="mt-4 text-center text-xs text-[var(--text-secondary)]">
                Only the recipient&rsquo;s initials are shown, to protect the
                privacy of a child.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-red-500/10">
                <ShieldAlert className="h-7 w-7 text-red-500" />
              </span>
              <h1 className="text-lg font-bold text-[var(--text-primary)]">
                No certificate matches that code
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Check the code printed on the certificate and try again. Codes
                are ten characters long.
              </p>
              <code className="rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 font-mono-ui text-xs text-[var(--text-secondary)]">
                {code}
              </code>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center gap-4">
          <Link
            href="/login"
            className="text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669]"
          >
            Go to the Kids In Tech portal
          </Link>
          <PoweredByStarNova />
        </div>
      </div>
    </main>
  );
}
