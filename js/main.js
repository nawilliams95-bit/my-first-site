function rdlInit() {
const header = document.querySelector('.site-header');
if (header) {
const onScroll = () => {
header.classList.toggle('scrolled', window.scrollY > 50);
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll(); // run once on load
}
const hamburger  = document.querySelector('.header-hamburger');
const mobileMenu = document.querySelector('.mobile-menu');
const closeBtn   = document.querySelector('.mobile-menu-close');
let _menuScrollY = 0;
function openMenu() {
if (!mobileMenu) return;
_menuScrollY = window.scrollY;
mobileMenu.classList.add('open');
if (hamburger) hamburger.classList.add('open');
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
if (mobileMenu) {
mobileMenu.addEventListener('click', e => {
if (e.target === mobileMenu) closeMenu();
});
}
document.querySelectorAll('.mobile-menu a').forEach(a => {
a.addEventListener('click', closeMenu);
});
document.addEventListener('keydown', e => {
if (e.key === 'Escape') closeMenu();
});
const currentPath = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.header-nav a, .mobile-menu a').forEach(link => {
const href = link.getAttribute('href') || '';
const linkPage = href.split('/').pop();
if (linkPage === currentPath || (currentPath === '' && linkPage === 'index.html')) {
link.classList.add('active');
}
});
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
fadeEls.forEach(el => el.classList.add('visible'));
}
if ('loading' in HTMLImageElement.prototype) {
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
const yearById = document.getElementById('footer-year');
if (yearById) yearById.textContent = new Date().getFullYear();
document.querySelectorAll('.copyright-year').forEach(el => {
el.textContent = new Date().getFullYear();
});
const LEAD_FORM_ENDPOINT = 'https://api.web3forms.com/submit';
const leadForm = document.getElementById('lead-form');
if (leadForm) {
const submitBtn = leadForm.querySelector('[type="submit"]');
const btnText   = leadForm.querySelector('.btn-text');
const spinner   = leadForm.querySelector('.spinner');
const statusMsg = document.getElementById('form-status');
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
leadForm.querySelectorAll('input, select, textarea').forEach(field => {
field.addEventListener('blur', () => validateField(field));
field.addEventListener('input', () => {
if (field.classList.contains('input-error')) validateField(field);
});
});
leadForm.addEventListener('submit', async (e) => {
e.preventDefault();
const fields = Array.from(leadForm.querySelectorAll('input, select, textarea'));
const valid  = fields.map(f => validateField(f)).every(Boolean);
if (!valid) {
const firstError = leadForm.querySelector('.input-error');
if (firstError) firstError.focus();
return;
}
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
window.location.href = '/thank-you';
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
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', rdlInit);
} else {
rdlInit();
}