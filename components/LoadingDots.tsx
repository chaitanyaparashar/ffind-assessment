export function LoadingDots() {
  return (
    <span
      className="inline-flex items-center gap-1"
      role="status"
      aria-label="Assistant is typing"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-current [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}
