// RealtyDataLabs — Main JS
// Initializes all page-level behaviors on DOMContentLoaded

function rdlInit() {

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

  let _menuScrollY = 0;

  function openMenu() {
    if (!mobileMenu) return;
    _menuScrollY = window.scrollY;
    mobileMenu.classList.add('open');
    if (hamburger) hamburger.classList.add('open');
    // iOS Safari: position:fixed is required to prevent background scroll
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + _menuScrollY + 'px';
    document.body.style.width = '100%';
  }

  function closeMenu() {
    if (!mobileMenu) return;
    mobileMenu.classList.remove('open');
    if (hamburger) hamburger.classList.remove('open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, _menuScrollY);
  }

  if (hamburger) hamburger.addEventListener('click', () => {
    mobileMenu && mobileMenu.classList.contains('open') ? closeMenu() : openMenu();
  });
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

  // ── Dynamic copyright year (supports both id and class) ──
  const yearById = document.getElementById('footer-year');
  if (yearById) yearById.textContent = new Date().getFullYear();
  document.querySelectorAll('.copyright-year').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // ============================================================
  // LEAD CAPTURE FORM — Web3Forms
  // ============================================================
  const LEAD_FORM_ENDPOINT = 'https://api.web3forms.com/submit';

  const leadForm = document.getElementById('lead-form');
  if (leadForm) {
    const submitBtn = leadForm.querySelector('[type="submit"]');
    const btnText   = leadForm.querySelector('.btn-text');
    const spinner   = leadForm.querySelector('.spinner');
    const statusMsg = document.getElementById('form-status');

    // ── Inline validation helpers ──────────────────────────────
    function setFieldError(input, msg) {
      input.classList.add('input-error');
      let err = input.parentElement.querySelector('.field-error');
      if (!err) {
        err = document.createElement('span');
        err.className = 'field-error';
        input.parentElement.appendChild(err);
      }
      err.textContent = msg;
    }

    function clearFieldError(input) {
      input.classList.remove('input-error');
      const err = input.parentElement.querySelector('.field-error');
      if (err) err.remove();
    }

    function validateEmail(val) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }

    function validatePhone(val) {
      // Optional — validate format if entered
      if (!val) return true;
      return /^[\d\s\(\)\-\+\.]{7,15}$/.test(val);
    }

    function validateField(input) {
      const val  = input.value.trim();
      const name = input.name;
      clearFieldError(input);

      if (input.required && !val) {
        setFieldError(input, 'This field is required.');
        return false;
      }
      if (name === 'fullName' && val && val.length < 2) {
        setFieldError(input, 'Please enter your full name.');
        return false;
      }
      if (name === 'email' && val && !validateEmail(val)) {
        setFieldError(input, 'Please enter a valid email address.');
        return false;
      }
      if (name === 'phone' && val && !validatePhone(val)) {
        setFieldError(input, 'Please enter a valid phone number.');
        return false;
      }
      return true;
    }

    // Validate on blur for each input/select/textarea
    leadForm.querySelectorAll('input, select, textarea').forEach(field => {
      field.addEventListener('blur', () => validateField(field));
      field.addEventListener('input', () => {
        if (field.classList.contains('input-error')) validateField(field);
      });
    });

    // ── Submit handler ─────────────────────────────────────────
    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Run full validation
      const fields = Array.from(leadForm.querySelectorAll('input, select, textarea'));
      const valid  = fields.map(f => validateField(f)).every(Boolean);
      if (!valid) {
        const firstError = leadForm.querySelector('.input-error');
        if (firstError) firstError.focus();
        return;
      }

      // Loading state
      if (submitBtn) submitBtn.disabled = true;
      if (btnText)   btnText.style.display = 'none';
      if (spinner)   spinner.style.display = 'inline-block';

      try {
        const response = await fetch(LEAD_FORM_ENDPOINT, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body:    JSON.stringify(Object.fromEntries(new FormData(leadForm)))
        });

        if (response.ok) {
          // Success — hide form fields, show confirmation
          const formGrid = leadForm.querySelector('.form-grid-2');
          if (formGrid) formGrid.style.display = 'none';
          if (submitBtn) submitBtn.style.display = 'none';
          if (statusMsg) {
            statusMsg.innerHTML = `
              <div class="form-success-state">
                <div class="form-success-icon">&#10003;</div>
                <h3>Thank you!</h3>
                <p>A licensed agent will contact you within 24 hours.</p>
              </div>`;
            statusMsg.className = 'form-status form-status-success';
          }
        } else {
          throw new Error('Server error');
        }
      } catch (err) {
        if (statusMsg) {
          statusMsg.textContent = 'Something went wrong. Please try again or contact us directly.';
          statusMsg.className   = 'form-status form-status-error';
        }
        if (submitBtn) submitBtn.disabled = false;
        if (btnText)   btnText.style.display = '';
        if (spinner)   spinner.style.display = 'none';
      }
    });
  }

  // ============================================================
  // NEWSLETTER SIGNUP — Web3Forms
  // ============================================================
  const NEWSLETTER_ENDPOINT = 'https://api.web3forms.com/submit';

  const newsletterForm   = document.getElementById('newsletter-form');
  const newsletterStatus = document.getElementById('newsletter-status');

  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = newsletterForm.querySelector('[type="email"]');
      const submitBtn  = newsletterForm.querySelector('button[type="submit"]');
      const email      = emailInput ? emailInput.value.trim() : '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (newsletterStatus) {
          newsletterStatus.textContent = 'Please enter a valid email address.';
          newsletterStatus.className   = 'newsletter-status newsletter-error';
        }
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (submitBtn) submitBtn.textContent = 'Subscribing...';

      try {
        const response = await fetch(NEWSLETTER_ENDPOINT, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body:    JSON.stringify(Object.fromEntries(new FormData(newsletterForm)))
        });

        if (response.ok) {
          // Success — replace form with confirmation
          newsletterForm.style.display = 'none';
          if (newsletterStatus) {
            newsletterStatus.textContent = 'You are subscribed. Welcome to the RealtyDataLabs weekly digest.';
            newsletterStatus.className   = 'newsletter-status newsletter-success';
          }
        } else {
          throw new Error('Server error');
        }
      } catch (err) {
        if (newsletterStatus) {
          newsletterStatus.textContent = 'Something went wrong. Please try again.';
          newsletterStatus.className   = 'newsletter-status newsletter-error';
        }
        if (submitBtn) {
          submitBtn.disabled   = false;
          submitBtn.textContent = 'Subscribe';
        }
      }
    });
  }

}

// Run immediately if DOM is already parsed (handles Rocket Loader / async injection),
// otherwise wait for DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rdlInit);
} else {
  rdlInit();
}
