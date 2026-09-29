import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Three token sets live here, deliberately namespaced so they cannot collide:
 *
 * - unprefixed shadcn-style tokens (`--background`, `--primary`, …) — the original trivia app
 * - `shell-*` — the neutral platform chrome that frames both games
 * - `sx-*` — ScribbleX's "Warm Doodle Pop" system, ported from design/warm_doodle_pop/DESIGN.md
 *
 * Nothing here renames or redefines an existing trivia token. See DECISIONS.md D2.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // ScribbleX: bubbly, pebble-like geometry
        'sx-sm': '0.5rem',
        sx: '1rem',
        'sx-md': '1.5rem',
        'sx-lg': '2rem',
        'sx-xl': '3rem',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },

        /** Platform shell — structure, not colour. Black is the honest neutral between the
         *  two games' very different worlds, and it lets both territories read as bright. */
        shell: {
          ink: '#17161A',
          'ink-soft': '#26242B',
          bone: '#F5F3EF',
          dim: '#807C86',
        },

        /** Trivia's world, borrowed into the shell for its entry gate only. */
        trivia: {
          violet: '#2E1065',
          deep: '#1E1B4B',
          peach: '#FFDAB9',
          'peach-strong': '#FBBF77',
        },

        /** ScribbleX — Warm Doodle Pop. Role tokens first, then the named brand palette. */
        sx: {
          surface: '#FFF7FD',
          'surface-dim': '#E1D7E1',
          'surface-lowest': '#FFFFFF',
          'surface-low': '#FBF1FA',
          'surface-container': '#F5EBF5',
          'surface-high': '#EFE5EF',
          'surface-highest': '#E9DFE9',
          'on-surface': '#1F1A21',
          'on-surface-variant': '#58423C',
          outline: '#8B716B',
          'outline-variant': '#DFC0B8',
          primary: '#A7391E',
          'on-primary': '#FFFFFF',
          'primary-container': '#FF7A59',
          'on-primary-container': '#701500',
          'primary-fixed': '#FFDAD2',
          'primary-fixed-dim': '#FFB4A2',
          secondary: '#785A00',
          'secondary-container': '#FEC736',
          'on-secondary-container': '#705400',
          'secondary-fixed': '#FFDF9A',
          'secondary-fixed-dim': '#F5BF2D',
          'on-secondary-fixed': '#251A00',
          tertiary: '#006A65',
          'on-tertiary': '#FFFFFF',
          'tertiary-container': '#2BB4AB',
          'on-tertiary-container': '#00403C',
          'tertiary-fixed': '#7CF6EC',
          error: '#BA1A1A',
          'error-container': '#FFDAD6',
          'on-error-container': '#93000A',
          // Named brand palette (DESIGN.md "Palette Architecture")
          coral: '#FF7A59',
          butter: '#FFC837',
          cyan: '#4ECDC4',
          lilac: '#B39DDB',
          bubblegum: '#FF85A1',
          mint: '#7BDCB5',
          ink: '#2B262D',
          cream: '#FFFDF7',
          paper: '#FBF6EB',
        },
      },
      fontFamily: {
        // Named `shell`/`sx-*` rather than `display`/`body`: globals.css already owns a
        // `.font-display` class for trivia (Outfit), and a Tailwind utility of the same name
        // would fight it.
        shell: ['"Bricolage Grotesque Variable"', '"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        'sx-display': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        'sx-body': ['Quicksand', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // ScribbleX type scale, straight from DESIGN.md
        'sx-hero': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'sx-hero-m': ['34px', { lineHeight: '42px', letterSpacing: '-0.01em', fontWeight: '800' }],
        'sx-headline-lg': ['36px', { lineHeight: '44px', letterSpacing: '-0.015em', fontWeight: '800' }],
        'sx-headline-lg-m': ['26px', { lineHeight: '34px', letterSpacing: '-0.01em', fontWeight: '800' }],
        'sx-headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'sx-headline-sm': ['20px', { lineHeight: '28px', fontWeight: '700' }],
        'sx-body-lg': ['18px', { lineHeight: '28px', fontWeight: '600' }],
        'sx-body-md': ['16px', { lineHeight: '24px', fontWeight: '500' }],
        'sx-body-sm': ['14px', { lineHeight: '20px', fontWeight: '500' }],
        'sx-label-lg': ['15px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '700' }],
        'sx-label-md': ['13px', { lineHeight: '18px', letterSpacing: '0.02em', fontWeight: '700' }],
        'sx-label-sm': ['11px', { lineHeight: '16px', letterSpacing: '0.03em', fontWeight: '700' }],
      },
      spacing: {
        // ScribbleX rhythm (DESIGN.md "Layout & Spacing")
        'sx-xs': '0.375rem',
        'sx-sm': '0.75rem',
        'sx-md': '1.25rem',
        'sx-lg': '2rem',
        'sx-xl': '3rem',
      },
      boxShadow: {
        // The tactile "sticker" elevation both design systems share — a hard offset, no blur.
        sticker: '0 4px 0 #2B262D',
        'sticker-hover': '0 6px 0 #2B262D',
        'sticker-press': '0 0 0 #2B262D',
        'shell-sticker': '0 5px 0 #17161A',
        'shell-sticker-hover': '0 8px 0 #17161A',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [animate],
};

export default config;
