// Auth route-group wrapper — full-viewport, no chrome.
// SplitScreenLayout (rendered by each page) handles the two-pane visuals.
// SessionProvider lives at the root layout, so no wrapper is needed here.

export default function AuthLayout({ children }) {
  return <div className="min-h-screen w-full">{children}</div>;
}
