export const theme = {
  colors: {
    // Primary brand colors (from logo)
    primary: {
      dark: '#1E293B',      // slate-900
      green: '#10B981',     // emerald-500
      slate: '#64748B',     // slate-500
    },
    // Gradients
    gradient: {
      authHero: 'linear-gradient(135deg, #1E293B 0%, #4F46E5 100%)',
      authHeroRTL: 'linear-gradient(225deg, #1E293B 0%, #4F46E5 100%)',
    },
    // Neutrals
    neutral: {
      white: '#FFFFFF',
      lightGray: '#F8FAFC',  // slate-50
      borderGray: '#E2E8F0', // slate-200
      textDark: '#1E293B',
      textSecondary: '#64748B',
    },
    // Semantic
    text: '#1E293B',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    background: '#FFFFFF',
    backgroundLight: '#F8FAFC',
    success: '#10B981',
    error: '#DC2626',
    warning: '#F59E0B',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '2.5rem',
    '3xl': '3rem',
  },
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    full: '9999px',
  },
} as const;
