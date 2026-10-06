export function NoticeBadge({ count = 0, tone = 'alert', label }) {
  const total = Math.max(0, Number(count) || 0);
  if (total <= 0) return null;
  const text = total > 99 ? '99+' : String(total);
  return (
    <span className={`notice-badge notice-badge--${tone}`} aria-label={label || `${total} notifications`}>
      {text}
    </span>
  );
}
