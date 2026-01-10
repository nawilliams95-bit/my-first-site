const form = document.getElementById("contactForm");
const statusText = document.getElementById("formStatus");

if (form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    statusText.textContent = "Message sent (demo). This form is not connected to email yet.";
    form.reset();
  });
}
