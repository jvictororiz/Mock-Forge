import { methodColor } from '../utils/format';

interface MethodBadgeProps {
  method: string;
  size?: 'sm' | 'md';
}

export function MethodBadge({ method, size = 'sm' }: MethodBadgeProps) {
  const color = methodColor(method);
  const padding = size === 'sm' ? '2px 6px' : '4px 10px';
  const fontSize = size === 'sm' ? '11px' : '12px';

  return (
    <span
      style={{
        display: 'inline-block',
        padding,
        fontSize,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        color: '#fff',
        backgroundColor: color,
        borderRadius: '4px',
        letterSpacing: '0.5px',
        minWidth: size === 'sm' ? '48px' : '56px',
        textAlign: 'center',
      }}
    >
      {method.toUpperCase()}
    </span>
  );
}
