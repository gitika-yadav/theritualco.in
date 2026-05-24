console.log("Navbar loaded");

const hamburger=
    document.getElementById(
        "hamburger"
    );

if(hamburger){

    hamburger.onclick=()=>{

        console.log(
            "clicked"
        );

        document
            .getElementById(
                "nav-links"
            )
            .classList.toggle(
            "active"
        );

    };

}