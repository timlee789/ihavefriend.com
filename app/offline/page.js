'use client';

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#FFFCF8',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{
        width: 88,
        height: 88,
        borderRadius: '50%',
        background: '#FDBA74',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 42,
        marginBottom: 24,
        boxShadow: '0 4px 20px rgba(249,115,22,0.25)',
      }}>
        E
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1C1917', margin: '0 0 10px', textAlign: 'center' }}>
        Emma is waiting for you
      </h1>
      <p style={{ fontSize: 15, color: '#78716C', textAlign: 'center', maxWidth: 280, lineHeight: 1.65, margin: 0 }}>
        It looks like you're offline right now.
        Emma will be right here when your connection comes back.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 32,
          padding: '14px 36px',
          borderRadius: 24,
          border: 'none',
          background: '#F97316',
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(249,115,22,0.35)',
        }}
      >
        Try again
      </button>
    </div>
  );
}
