// La sesión y los datos tributarios siempre requieren conexión al servidor.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', async () => {
    try {
      // Sustituye el worker generado de Flutter que podía conservar versiones antiguas.
      await navigator.serviceWorker.register('/app-worker.js', { scope: '/', updateViaCache: 'none' });
    } catch { /* La aplicación sigue funcionando sin instalación. */ }
  });
}
