document.addEventListener(
    "DOMContentLoaded",
    ()=>{

        const params=
            new URLSearchParams(
                window.location.search
            );

        const weight=
            params.get(
                "weight"
            );

        const color=
            params.get(
                "color"
            );

        const productSelect=
            document.getElementById(
                "product"
            );

        const colorInput=
            document.getElementById(
                "color"
            );

        if(weight&&productSelect){

            productSelect.value=

                weight==="2kg"

                    ?

                    "1999"

                    :

                    "1499";

        }

        if(color&&colorInput){

            colorInput.value=color;

        }

    });