/**
 * The positive-language check on instructor feedback (PRD §10).
 *
 * Kids In Tech's policy requires encouraging language toward every child.
 * This is the server end of that: feedback containing a discouraging phrase
 * is refused with 422 and a suggested rewording, rather than quietly
 * delivered to an eight-year-old.
 *
 * It is deliberately a short, literal list, not a cleverness contest. A
 * sentiment model would misfire on "this is wrong" in a maths correction,
 * which is legitimate and specific. These are phrases aimed at the child
 * rather than the work.
 */

/**
 * Each entry: the phrase to catch and what to say instead.
 * Matched case-insensitively on word boundaries, so "stupid" is caught but
 * "stupidly simple trick" — still bad, but about the work — is not special
 * cased either way.
 */
const DISCOURAGING = [
  { pattern: /\bstupid\b/i, suggestion: "Describe what to change, e.g. \"try a different block here\"." },
  { pattern: /\bdumb\b/i, suggestion: "Describe what to change rather than judging the pupil." },
  { pattern: /\blazy\b/i, suggestion: "Name the missing piece, e.g. \"this needs the second sprite\"." },
  { pattern: /\buseless\b/i, suggestion: "Say what would make it work instead." },
  { pattern: /\bterrible\b/i, suggestion: "Try \"this needs more work on …\"." },
  { pattern: /\bawful\b/i, suggestion: "Try \"let's improve …\"." },
  { pattern: /\brubbish\b/i, suggestion: "Try \"this isn't working yet because …\"." },
  { pattern: /\bpathetic\b/i, suggestion: "Focus on the next step the pupil can take." },
  { pattern: /\bhopeless\b/i, suggestion: "Try \"you're not there yet — here's what to do next\"." },
  { pattern: /\bworthless\b/i, suggestion: "Say what the work is missing instead." },
  { pattern: /\bidiot\b/i, suggestion: "Address the work, never the pupil." },
  { pattern: /\bnonsense\b/i, suggestion: "Explain which part is unclear and why." },
  { pattern: /\bwaste of time\b/i, suggestion: "Try \"let's focus on … next time\"." },
  { pattern: /\bnever (?:going to|gonna) (?:get|learn|understand)\b/i, suggestion: "Try \"this takes practice — let's work through it together\"." },
  { pattern: /\byou (?:always|never) \b/i, suggestion: "Comment on this piece of work, not a pattern." },
  { pattern: /\bgive up\b/i, suggestion: "Try \"let's try a smaller step first\"." },
  { pattern: /\bcan'?t (?:you )?(?:even|do)\b/i, suggestion: "Try \"here's how to approach this\"." },
  { pattern: /\bdisappointing\b/i, suggestion: "Say what you hoped to see, and how to get there." },
];

/**
 * Checks a piece of feedback.
 *
 * @param {string} text
 * @returns {{ ok: boolean, matches: string[], suggestions: string[] }}
 */
export function checkPositiveLanguage(text) {
  const value = String(text ?? "");
  const matches = [];
  const suggestions = [];

  for (const entry of DISCOURAGING) {
    const found = value.match(entry.pattern);
    if (found) {
      matches.push(found[0]);
      if (!suggestions.includes(entry.suggestion)) {
        suggestions.push(entry.suggestion);
      }
    }
  }

  return { ok: matches.length === 0, matches, suggestions };
}
