"use client";

// Next's per-segment error boundary. Every page beneath this folder gets it,
// so a page that throws is replaced by the fallback while the sidebar,
// header and navigation stay where they are. See SegmentError for why.
export { default } from "@/_components/ui/SegmentError";
