export const SpinnerIcon = () => (
  <svg
    aria-hidden="true"
    style={{
      animation: 'spin 1s linear infinite',
      width: '16px',
      height: '16px',
      marginRight: '6px'
    }}
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
)
