document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("hamburger");
  const navLinks = document.getElementById("nav-links");

  if (toggle && navLinks) {
    toggle.addEventListener("click", () => {
      console.log("Hamburger clicked");
      navLinks.classList.toggle("show");
    });
  }
});

