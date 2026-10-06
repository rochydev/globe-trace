/**
 * Modal de bienvenida: se abre al entrar y se puede volver a abrir desde el botón (i).
 * Se cierra con el botón, con Esc (lo da <dialog>) o haciendo clic fuera de la tarjeta.
 */
export function createIntroModal({ onClose } = {}) {
  const dialog = document.getElementById('intro');
  const closeBtn = document.getElementById('intro-close');
  const openBtn = document.getElementById('intro-open');

  function close() {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    // Se espera a que acabe la animación de salida antes de cerrar de verdad
    dialog.classList.add('is-closing');
    dialog.addEventListener(
      'animationend',
      () => {
        dialog.classList.remove('is-closing');
        dialog.close();
      },
      { once: true },
    );
  }

  closeBtn.addEventListener('click', close);
  openBtn.addEventListener('click', () => dialog.showModal());

  // Un clic en el fondo llega al propio <dialog>; uno en la tarjeta llega a sus hijos
  dialog.addEventListener('click', (e) => e.target === dialog && close());

  // Esc: se intercepta para usar también la animación de salida
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  dialog.addEventListener('close', () => onClose?.());

  return {
    open: () => dialog.showModal(),
  };
}
