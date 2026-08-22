import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        field: {
          night: '#08090B', // midnight black - main background
          panel: '#12151A', // charcoal - cards / panels
          panel2: '#1D222A', // raised surface
          line: '#29303C', // hairlines, yard-line strokes
        },
        turf: {
          DEFAULT: '#1B643A',
          bright: '#31B56A', // pick green - correct picks / wins
        },
        bulb: {
          DEFAULT: '#C9A227', // championship gold - primary accent
          bright: '#E3C45C', // bright gold - hover / highlights
          dim: '#8D711B', // darker gold - hover state on filled gold buttons
        },
        chalk: '#F4F4F1', // off white - main text
        miss: '#E05252', // loss red - incorrect picks
        muted: '#8B919A', // slate gray - secondary text
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
        glow: '0 0 24px rgba(201,162,39,0.25)',
      },
    },
  },
  plugins: [],
};

export default config;
