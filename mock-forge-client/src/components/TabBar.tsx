import React from 'react';

type TabBarProps = {
  variant?: 'underline' | 'pill';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function TabBar({
  variant = 'underline',
  children,
  className,
  style,
}: TabBarProps) {
  const classes = [
    'mf-tab-bar',
    variant === 'pill' ? 'mf-tab-bar--pill' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}

type TabProps = {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function Tab({
  active,
  onClick,
  children,
  className,
  style,
}: TabProps) {
  const classes = [
    'mf-tab',
    active ? 'mf-tab--active' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type="button" className={classes} onClick={onClick} style={style}>
      {children}
    </button>
  );
}
