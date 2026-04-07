/**
 * Offline Page Component
 * 
 * Place this in: app/offline/page.jsx
 * Shown when user has no internet connection.
 */

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
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: '#F5C4B3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 36,
        marginBottom: 24,
      }}>
        E
      </div>
      <h1 style={{
        fontSize: 20,
        fontWeight: 500,
        color: '#4A1B0C',
        margin: '0 0 8px',
      }}>
        Emma is waiting for you
      </h1>
      <p style={{
        fontSize: 15,
        color: '#888',
        textAlign: 'center',
        maxWidth: 280,
        lineHeight: 1.6,
      }}>
        It looks like you are offline right now. 
        Emma will be right here when your connection comes back.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 32,
          padding: '14px 32px',
          borderRadius: 24,
          border: 'none',
          background: '#F0997B',
          color: '#4A1B0C',
          fontSize: 15,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
