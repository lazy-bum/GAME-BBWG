export function bindMediaEvents() {
  document.querySelectorAll('.avatar-image').forEach((image) => {
    image.addEventListener('click', (event) => {
      event.stopPropagation();
      const lightbox = document.querySelector('#avatar-lightbox');
      const lightboxImage = document.querySelector('#avatar-lightbox-image');
      const src = image.getAttribute('src');
      const alt = image.getAttribute('alt') || '头像预览';

      if (!lightbox || !lightboxImage || !src) {
        return;
      }

      lightboxImage.setAttribute('src', src);
      lightboxImage.setAttribute('alt', alt);
      lightbox.hidden = false;
    });

    image.addEventListener(
      'error',
      () => {
        const fallback = document.createElement('span');
        fallback.className = 'avatar-fallback';
        fallback.textContent = '无头像';
        image.replaceWith(fallback);
      },
      { once: true }
    );
  });

  const avatarLightbox = document.querySelector('#avatar-lightbox');
  const avatarLightboxImage = document.querySelector('#avatar-lightbox-image');
  avatarLightbox?.addEventListener('click', () => {
    avatarLightbox.hidden = true;
    avatarLightboxImage?.removeAttribute('src');
  });

  avatarLightboxImage?.addEventListener('click', (event) => {
    event.stopPropagation();
    const currentLightbox = document.querySelector('#avatar-lightbox');
    const currentLightboxImage = document.querySelector('#avatar-lightbox-image');
    if (currentLightbox) {
      currentLightbox.hidden = true;
    }
    currentLightboxImage?.removeAttribute('src');
  });
}
