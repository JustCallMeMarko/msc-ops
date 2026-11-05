export function Counter({ value }: { value: number }) {
  return <span className="mono rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">{value}</span>;
}
