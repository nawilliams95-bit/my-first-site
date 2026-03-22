// RealtyDataLabs — Main JS
// Initializes all page-level behaviors on DOMContentLoaded

document.addEventListener('DOMContentLoaded', () => {

  // ============================================================
  // HEADER SCROLL BEHAVIOR
  // ============================================================
  const header = document.querySelector('.site-header');
  if (header) {
    const onScroll = () => {
      header.classList.toggle('scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on load
  }

  // ============================================================
  // MOBILE MENU
  // ============================================================
  const hamburger  = document.querySelector('.header-hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  const closeBtn   = document.querySelector('.mobile-menu-close');

  function openMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.add('open');
    if (hamburger) hamburger.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('open');
    if (hamburger) hamburger.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (hamburger) hamburger.addEventListener('click', openMenu);
  if (closeBtn)  closeBtn.addEventListener('click', closeMenu);

  // Close on overlay click (outside nav links)
  if (mobileMenu) {
    mobileMenu.addEventListener('click', e => {
      if (e.target === mobileMenu) closeMenu();
    });
  }

  // Close on nav link click
  document.querySelectorAll('.mobile-menu a').forEach(a => {
    a.addEventListener('click', closeMenu);
  });

  // Close on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });

  // ============================================================
  // ACTIVE NAV LINK
  // ============================================================
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.header-nav a, .mobile-menu a').forEach(link => {
    const href = link.getAttribute('href') || '';
    const linkPage = href.split('/').pop();
    if (linkPage === currentPath || (currentPath === '' && linkPage === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ============================================================
  // FADE-IN INTERSECTION OBSERVER
  // ============================================================
  const fadeEls = document.querySelectorAll('.fade-in');
  if (fadeEls.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    fadeEls.forEach(el => observer.observe(el));
  } else {
    // Fallback: show all immediately
    fadeEls.forEach(el => el.classList.add('visible'));
  }

  // ============================================================
  // LAZY IMAGE LOADING (native + observer fallback)
  // ============================================================
  if ('loading' in HTMLImageElement.prototype) {
    // Browser supports native lazy loading — already handled via loading="lazy" attribute
  } else if ('IntersectionObserver' in window) {
    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            imgObserver.unobserve(img);
          }
        }
      });
    });
    document.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
  }

  // ============================================================
  // DYNAMIC FOOTER YEAR
  // ============================================================
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ============================================================
  // LEAD CAPTURE FORM — ZAPIER WEBHOOK
  // ============================================================
  const leadForm = document.getElementById('lead-form');
  if (leadForm) {
    const submitBtn  = leadForm.querySelector('[type="submit"]');
    const statusMsg  = document.getElementById('form-status');

    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Disable button / show loading state
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }

      const formData = new FormData(leadForm);
      const payload  = Object.fromEntries(formData.entries());

      // WORTH VERIFYING: Replace this URL with your actual Zapier webhook URL
      const ZAPIER_WEBHOOK = 'https://hooks.zapier.com/hooks/catch/REPLACE_WITH_YOUR_ZAPIER_HOOK_ID/';

      try {
        await fetch(ZAPIER_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // Success state
        if (statusMsg) {
          statusMsg.textContent = 'Thank you! An agent will be in touch shortly.';
          statusMsg.className = 'form-status form-status-success';
        }
        leadForm.reset();

      } catch (err) {
        // Error state
        if (statusMsg) {
          statusMsg.textContent = 'Something went wrong. Please try again or call us directly.';
          statusMsg.className = 'form-status form-status-error';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Connect With an Agent';
        }
      }
    });
  }

  // ============================================================
  // NEWSLETTER SIGNUP
  // ============================================================
  const newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    const newsletterStatus = document.getElementById('newsletter-status');
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = newsletterForm.querySelector('[type="email"]').value;
      // WORTH VERIFYING: Connect to your email service (Mailchimp, ConvertKit, etc.)
      // For now, just shows success message
      if (newsletterStatus) {
        newsletterStatus.textContent = 'You\'re subscribed! Check your inbox.';
        newsletterStatus.className = 'newsletter-status newsletter-success';
      }
      newsletterForm.reset();
    });
  }

});
