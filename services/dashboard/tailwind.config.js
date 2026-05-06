/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
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
