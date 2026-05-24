console.log("Navbar loaded");

window.addEventListener(
    "load",
    ()=>{

        const toggle=

            document.getElementById(
                "hamburger"
            );

        const navLinks=

            document.getElementById(
                "nav-links"
            );

        console.log(
            toggle,
            navLinks
        );

        if(
            toggle&&navLinks
        ){

            toggle.onclick=()=>{

                console.log(
                    "clicked"
                );

                navLinks.classList.toggle(
                    "active"
                );

            };

        }

    }
);