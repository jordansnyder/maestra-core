/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── Brand semantic tokens ──────────────────────────────────────────────
      // Values resolve from CSS custom properties in globals.css, which flip
      // between the light (brand) and dark (sibling) themes via [data-theme].
      // Use these instead of raw slate-*/blue-* so the theme toggle works.
      colors: {
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)', // page background
          1: 'rgb(var(--surface-1) / <alpha-value>)', // cards, panels
          2: 'rgb(var(--surface-2) / <alpha-value>)', // elevated: modals, popovers
        },
        fg: {
          DEFAULT: 'rgb(var(--text-primary) / <alpha-value>)',
          muted: 'rgb(var(--text-secondary) / <alpha-value>)',
          subtle: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
          fg: 'rgb(var(--accent-contrast) / <alpha-value>)', // text/icon on accent fills
        },
        edge: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      borderColor: {
        DEFAULT: 'rgb(var(--border) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        display: '-0.02em',
        hud: '0.09em',
      },
      // ── Sharp corners (Swiss/editorial brand) ──────────────────────────────
      // Every named radius collapses to 0 so existing rounded-lg/xl render
      // square without touching 200+ usages. `full` stays for status dots,
      // avatars, and spinners.
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '9999px',
      },
      transitionTimingFunction: {
        settle: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      backgroundImage: {
        'grid-dots': 'radial-gradient(rgb(var(--text-primary) / 0.08) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid-24': '24px 24px',
      },
      width: {
        // Named sidebar widths — values come from CSS custom properties in globals.css
        // so a single source of truth controls both Tailwind classes and inline styles.
        'sidebar-nav': 'var(--sidebar-nav-width)',  // left navigation drawer (14rem / 224px)
        'sidebar-dmx': 'var(--sidebar-dmx-width)',  // DMX Lighting right panel (295px)
      },
    },
  },
  plugins: [],
}
