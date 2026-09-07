(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------
  // Hero threads: add the packets that travel along each thread.
  //
  // The paths themselves live in the HTML so a browser without JS still
  // gets the still lines. The packets are the only thing that needs
  // `offset-path`, which has to be written in CSS with the same path
  // data, so we read it from the SVG instead of duplicating it.
  // Reduced motion: no packets at all (the CSS also hides them).
  // ---------------------------------------------------------------------
  const threads = document.querySelector('.threads');
  if (threads && !reduce && CSS.supports('offset-path', 'path("M0 0L1 1")')) {
    const paths = Array.from(threads.querySelectorAll('path'));
    const ns = 'http://www.w3.org/2000/svg';
    paths.forEach((p, i) => {
      const d = p.getAttribute('d');
      // Two packets per thread, spaced half a lap apart, each thread at
      // its own pace so the pattern never visibly repeats.
      const dur = 14 + ((i * 2.7) % 9);
      for (let k = 0; k < 2; k++) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('class', 'packet');
        c.style.offsetPath = `path("${d}")`;
        c.style.setProperty('--dur', dur + 's');
        c.style.setProperty('--delay', -((k * dur) / 2 + i * 1.3) + 's');
        threads.appendChild(c);
      }
    });
  }

  // ---------------------------------------------------------------------
  // FAQ: wrap each <details>'s non-summary children inside a .faq-body
  // div so there is a single element whose height we can animate.
  // ---------------------------------------------------------------------
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

    if (reduce) return; // native <details> toggle, instantly

    let animating = false;

    summary.addEventListener('click', (event) => {
      event.preventDefault();
      if (animating) return;
      animating = true;

      const opening = !d.open;

      if (opening) {
        d.open = true;
        const target = body.scrollHeight;
        body.style.height = '0px';
        body.style.opacity = '0';
        // Force a reflow so the browser registers the start state before
        // we change to the end state in the next frame.
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

  // ---------------------------------------------------------------------
  // Sticky header: show its bottom rule once the page has been scrolled.
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Sections fade in as they enter the viewport. The hero has its own
  // load sequence, so it is skipped.
  // ---------------------------------------------------------------------
  const sections = document.querySelectorAll('section.block');
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
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
  );
  sections.forEach((s) => io.observe(s));
})();
