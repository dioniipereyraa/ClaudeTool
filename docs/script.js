(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Wrap each FAQ <details>'s non-summary children inside a .faq-body div
  // so we have a single element to animate.
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

    if (reduce) return; // let the native <details> toggle happen instantly

    let animating = false;

    summary.addEventListener('click', (event) => {
      if (animating) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      animating = true;

      const opening = !d.open;

      if (opening) {
        d.open = true;
        const target = body.scrollHeight;
        body.style.height = '0px';
        body.style.opacity = '0';
        // Force a reflow so the browser registers the start state before we
        // change to the end state in the next frame.
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

  // Sticky header: add .scrolled class once the page has been scrolled.
  const header = document.querySelector('header.site');
  if (header) {
    const onScroll = () => {
      if (window.scrollY > 4) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  if (reduce) return;

  // Reveal sections as they enter the viewport (skip hero, it has its own
  // entrance animation already).
  const sections = document.querySelectorAll('section:not(.hero)');
  sections.forEach((s) => s.classList.add('reveal'));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );
  sections.forEach((s) => io.observe(s));
})();
