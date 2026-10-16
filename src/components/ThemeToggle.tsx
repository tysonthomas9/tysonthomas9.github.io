import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/** Small island that switches between the light (cream) and dark (night blueprint) themes. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable: theme still applies for this page view */
    }
    setTheme(next);
  };

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="label inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[2px] border border-ink bg-paper-raised px-3 text-ink hover:bg-ink hover:text-paper"
    >
      <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
