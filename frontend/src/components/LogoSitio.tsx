export function LogoSitio({ className }: { className?: string }) {
  return (
    <div
      className={`relative flex h-11 w-11 items-center justify-center border border-cian/50 bg-panel ${className ?? ""}`}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-cian"
      />
      <span
        aria-hidden="true"
        className="absolute right-0 top-0 h-2 w-2 border-r-2 border-t-2 border-cian"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2 border-cian"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2 border-cian"
      />
      <span className="text-center font-mono leading-none">
        <span className="block text-[11px] font-bold tracking-[0.14em] text-cian [text-shadow:0_0_8px_currentColor]">
          UNDEF
        </span>
        <span className="mt-0.5 block text-[8px] tracking-[0.42em] text-texto-2">
          FIE
        </span>
      </span>
    </div>
  );
}