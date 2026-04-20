/* ============================================================
   FURNI. — main.js  (UI animations & nav — every page)
   Cart/Search/Modal are handled by common.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Scroll navbar ── */
  const navbar = document.querySelector('.navbar');
  function handleNavScroll() {
    navbar?.classList.toggle('scrolled', window.scrollY > 60);
  }
  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll();

  /* ── Hamburger / Mobile menu ── */
  const hamburger  = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
      document.body.style.overflow = mobileMenu.classList.contains('open') ? 'hidden' : '';
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  /* ── Intersection Observer: fade-up ── */
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

  /* ── Stagger children ── */
  document.querySelectorAll('[data-stagger]').forEach(parent => {
    parent.querySelectorAll(':scope > *').forEach((child, i) => {
      child.classList.add('fade-up');
      child.style.transitionDelay = `${i * 0.1}s`;
      observer.observe(child);
    });
  });

  /* ── Hero parallax ── */
  const heroImg = document.querySelector('.hero-img');
  if (heroImg) {
    window.addEventListener('scroll', () => {
      heroImg.style.transform = `translateY(${Math.min(window.scrollY * 0.18, 80)}px)`;
    }, { passive: true });
  }

  /* ── Ripple on buttons ── */
  document.querySelectorAll('.btn-primary, .btn-dark').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      const rect   = this.getBoundingClientRect();
      const size   = Math.max(rect.width, rect.height);
      ripple.style.cssText = `position:absolute;border-radius:50%;width:${size}px;height:${size}px;
        left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;
        background:rgba(255,255,255,.25);transform:scale(0);animation:rippleAnim .5s linear;pointer-events:none;`;
      this.style.position = 'relative'; this.style.overflow = 'hidden';
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);
    });
  });
});

const rippleStyle = document.createElement('style');
rippleStyle.textContent = `@keyframes rippleAnim{to{transform:scale(3);opacity:0}}`;
document.head.appendChild(rippleStyle);