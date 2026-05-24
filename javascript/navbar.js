console.log("Navbar JS loaded");

function initNavbar(){

    const toggle=
        document.getElementById(
            "hamburger"
        );

    const navLinks=
        document.getElementById(
            "nav-links"
        );

    if(!toggle||!navLinks){
        console.warn(
            "Navbar elements missing"
        );
        return;
    }

    toggle.onclick=(e)=>{
        e.stopPropagation();
        navLinks.classList.toggle(
            "active"
        );
    };
    document.onclick=(e)=>{
        if(
            !navLinks.contains(
                e.target
            )
            &&
            !toggle.contains(
                e.target
            )
        ){
            navLinks.classList.remove(
                "active"
            );
        }
    };

}

if(
    document.readyState===
    "loading"
){
    document.addEventListener(
        "DOMContentLoaded",
        initNavbar
    );
}else{
    initNavbar();
}