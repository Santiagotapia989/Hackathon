export function EscudoAduana({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M16 3 L27 7 V15 C27 22 22 26.5 16 29 C10 26.5 5 22 5 15 V7 Z" />
      <path d="M11 15.5 L14.5 19 L21 12.5" />
    </svg>
  );
}