 console.log("Navbar JS loaded");

 // No need for DOMContentLoaded here — navbar is already in the DOM now
 const toggle = document.getElementById("hamburger");
 const navLinks = document.getElementById("nav-links");

 if (toggle && navLinks) {
   toggle.addEventListener("click", () => {
     console.log("Hamburger clicked");
     navLinks.classList.toggle("show");
   });
 } else {
   console.warn("Hamburger or navLinks not found in DOM");
 }


