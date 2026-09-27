import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand scale derived from the CUBUS brand color #400c4d (kept exact
        // at shade 900), same hue/saturation tapered across lightness so the
        // whole app UI (buttons, focus rings, badges, links) shares one
        // consistent theme with the generated exam papers.
        brand: {
          50: '#fbf5fc',
          100: '#f5eaf8',
          200: '#eacdf1',
          300: '#d9a1e8',
          400: '#c360dc',
          500: '#a926c9',
          600: '#831b9d',
          700: '#651379',
          800: '#4d0f5d',
          900: '#400c4d',
          950: '#2a0932',
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f7f8fa',
          muted: '#eef0f4',
          border: '#e2e5eb',
        },
        ink: {
          DEFAULT: '#161a2b',
          muted: '#565d72',
          faint: '#8891a5',
        },
        success: '#16794f',
        warning: '#9a6a03',
        danger: '#b3261e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(22,26,43,0.06), 0 1px 3px 0 rgba(22,26,43,0.08)',
      },
    },
  },
  plugins: [],
}

export default config
