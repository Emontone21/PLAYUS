// Corona del campeón de la temporada anterior. Va al lado del nombre.
export function Crown({ title = "campeón de la temporada pasada" }: { title?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" role="img" aria-label={title} className="inline-block shrink-0" data-testid="crown">
      <title>{title}</title>
      <path d="M3 18 L3 8 L8 12 L12 5 L16 12 L21 8 L21 18 Z" fill="#FFC94A" />
      <rect x="3" y="18" width="18" height="3" fill="#FFC94A" />
    </svg>
  );
}
