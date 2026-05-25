document.addEventListener(
    "DOMContentLoaded",
    ()=>{

        const preorderBtn=

            document.getElementById(
                "preorder-btn"
            );

        if(!preorderBtn)return;

        preorderBtn.addEventListener(
            "click",
            ()=>{

                const selectedWeight=

                    document.querySelector(
                        ".weight-option.selected"
                    )

                        ?.dataset.weight||

                    "1kg";

                const selectedColor=

                    document.querySelector(
                        ".color-option.selected"
                    )

                        ?.dataset.color||

                    "sand";

                window.location=

                    `/checkout.html?weight=${selectedWeight}&color=${selectedColor}`;

            });

    });