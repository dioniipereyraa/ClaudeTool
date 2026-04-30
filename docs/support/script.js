(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Wrap each FAQ <details>'s non-summary children inside a .faq-body div
  // so we have a single element to animate (matches the homepage pattern).
  document.querySelectorAll('.faq details').forEach((d) => {
    const summary = d.querySelector('summary');
    if (!summary) return;
    const body = document.createElement('div');
    body.className = 'faq-body';
    let n = summary.nextSibling;
    while (n) {
      const next = n.nextSibling;
      body.appendChild(n);
      n = next;
    }
    d.appendChild(body);

    if (reduce) return;

    let animating = false;
    summary.addEventListener('click', (event) => {
      if (animating) { event.preventDefault(); return; }
      event.preventDefault();
      animating = true;

      const opening = !d.open;
      if (opening) {
        d.open = true;
        const target = body.scrollHeight;
        body.style.height = '0px';
        body.style.opacity = '0';
        void body.offsetHeight;
        requestAnimationFrame(() => {
          body.style.height = target + 'px';
          body.style.opacity = '1';
        });
        const onEnd = (e) => {
          if (e.target !== body || e.propertyName !== 'height') return;
          body.removeEventListener('transitionend', onEnd);
          body.style.height = '';
          body.style.opacity = '';
          animating = false;
        };
        body.addEventListener('transitionend', onEnd);
      } else {
        const start = body.scrollHeight;
        body.style.height = start + 'px';
        body.style.opacity = '1';
        void body.offsetHeight;
        requestAnimationFrame(() => {
          body.style.height = '0px';
          body.style.opacity = '0';
        });
        const onEnd = (e) => {
          if (e.target !== body || e.propertyName !== 'height') return;
          body.removeEventListener('transitionend', onEnd);
          d.open = false;
          body.style.height = '';
          body.style.opacity = '';
          animating = false;
        };
        body.addEventListener('transitionend', onEnd);
      }
    });
  });

  // Sticky header shadow on scroll (matches homepage).
  const header = document.querySelector('header.site');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 4) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Contact form: AJAX submit to Web3Forms with inline status feedback.
  const form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('.form-status');
      const button = form.querySelector('.form-submit');
      const originalLabel = button.textContent;

      status.hidden = false;
      status.className = 'form-status sending';
      status.textContent = 'Sending...';
      button.disabled = true;
      button.textContent = 'Sending...';

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
          status.className = 'form-status success';
          status.textContent = 'Thanks, your message is on its way. Replies usually land within 24-72h.';
          form.reset();
        } else {
          throw new Error(data.message || 'Submit failed');
        }
      } catch (err) {
        status.className = 'form-status error';
        status.textContent = 'Something went wrong sending the form. Please email support@exportal.dev directly.';
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  }
})();
