import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        field: {
          night: '#0B1220', // night sky / stadium bowl
          panel: '#141B2E', // card surface
          panel2: '#1B2440', // raised surface
          line: '#2A3454', // hairlines, yard-line strokes
        },
        turf: {
          DEFAULT: '#2F5233',
          bright: '#4C7A4F',
        },
        bulb: {
          DEFAULT: '#F5A623', // scoreboard amber
          dim: '#B8791A',
        },
        chalk: '#E8E6DE', // off-white text, not the cliche cream
        miss: '#C4432B',
        muted: '#8A93AD',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        score: ['var(--font-score)'],
      },
      backgroundImage: {
        turf: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 2px, transparent 2px, transparent 40px)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(245,166,35,0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
