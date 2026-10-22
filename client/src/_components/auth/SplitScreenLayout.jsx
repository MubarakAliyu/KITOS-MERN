// Shared two-pane layout for /login, /forgot-password, /reset-password.
//
// Breakpoints (Tailwind defaults):
//   <  640px        : form only (right panel hidden, brand block stays inside form)
//   640 - 1023px    : right panel renders ABOVE the form as a hero strip
//   >= 1024px       : side-by-side, right panel on the right at 50% width
export default function SplitScreenLayout({ left, right }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Brand pane — order-first on tablet, order-last on desktop */}
      <aside
        className="hidden sm:block bg-[#0B1220] text-white order-first lg:order-last lg:w-1/2 lg:min-h-screen relative overflow-hidden"
      >
        <div className="px-6 py-10 sm:py-12 lg:py-14 lg:px-16 lg:min-h-screen lg:flex lg:items-center lg:justify-center">
          <div className="w-full max-w-lg">{right}</div>
        </div>
      </aside>

      {/* Form pane — always visible */}
      <main className="bg-white lg:w-1/2 lg:min-h-screen flex items-center justify-center px-6 py-10 sm:py-12 lg:px-16">
        <div className="w-full max-w-md">{left}</div>
      </main>
    </div>
  );
}
