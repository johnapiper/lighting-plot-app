import { useEffect } from 'react';

/** Applies the chosen theme ('dark' | 'light' | 'system') to <html data-theme>, following the OS in 'system'. */
export function useTheme(theme) {
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    const apply = () => {
      const eff = theme === 'system' ? (mq?.matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = eff;
    };
    apply();
    if (theme !== 'system' || !mq) return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
