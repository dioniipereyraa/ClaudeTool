(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------
  // Hero threads.
  //
  // The paths live in the HTML so a browser without JS still gets the
  // still lines. Two things are added here:
  //
  //   1. A draw-in on load, done with the real path length (getTotalLength)
  //      instead of pathLength + non-scaling-stroke, which Safari measures
  //      in screen pixels and leaves half-drawn.
  //   2. The packets that travel along each thread, as native SVG
  //      <animateMotion> + <mpath>. It is supported everywhere, unlike
  //      CSS offset-path on SVG elements.
  //
  // Reduced motion: no draw-in and no packets.
  // ---------------------------------------------------------------------
  const threads = document.querySelector('.threads');
  if (threads && !reduce) {
    const ns = 'http://www.w3.org/2000/svg';
    const xlink = 'http://www.w3.org/1999/xlink';
    const paths = Array.from(threads.querySelectorAll('path'));

    paths.forEach((p, i) => {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.style.transitionDelay = i * 90 + 'ms';
      // Reflow so the start state is committed before the transition.
      void p.getBoundingClientRect();
      p.classList.add('drawing');
      p.style.strokeDashoffset = '0';
      p.addEventListener(
        'transitionend',
        () => {
          p.classList.remove('drawing');
          p.style.strokeDasharray = '';
          p.style.strokeDashoffset = '';
          p.style.transitionDelay = '';
        },
        { once: true },
      );
    });

    paths.forEach((p, i) => {
      // Each thread at its own pace, two packets half a lap apart, and a
      // short tail behind each so the direction reads at a glance.
      const dur = 16 + ((i * 2.7) % 9);
      for (let k = 0; k < 2; k++) {
        const begin = -((k * dur) / 2 + i * 1.3);
        [
          [0, 3.5, ''],
          [-0.35, 2.5, 'tail'],
          [-0.7, 1.75, 'tail'],
        ].forEach(([lag, r, cls]) => {
          const c = document.createElementNS(ns, 'circle');
          c.setAttribute('class', 'packet' + (cls ? ' ' + cls : ''));
          c.setAttribute('r', String(r));
          const m = document.createElementNS(ns, 'animateMotion');
          m.setAttribute('dur', dur + 's');
          m.setAttribute('repeatCount', 'indefinite');
          m.setAttribute('begin', begin + lag + 's');
          const mp = document.createElementNS(ns, 'mpath');
          mp.setAttribute('href', '#' + p.id);
          mp.setAttributeNS(xlink, 'xlink:href', '#' + p.id);
          m.appendChild(mp);
          c.appendChild(m);
          threads.appendChild(c);
        });
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
