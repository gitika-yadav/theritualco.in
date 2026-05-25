const crypto=
    require(
        "crypto"
    );

exports.handler=
    async(event)=>{

        try{

            const body=

                JSON.parse(
                    event.body
                );

            const{

                razorpay_order_id,

                razorpay_payment_id,

                razorpay_signature

            }=body;

            if(

                !razorpay_order_id||

                !razorpay_payment_id||

                !razorpay_signature

            ){

                return{

                    statusCode:400,

                    body:

                        JSON.stringify({

                            success:false

                        })

                };

            }

            const generated=

                crypto

                    .createHmac(

                        "sha256",

                        process.env
                            .RAZORPAY_KEY_SECRET

                    )

                    .update(

                        `${razorpay_order_id}|${razorpay_payment_id}`

                    )

                    .digest(

                        "hex"

                    );

            if(

                generated!==

                razorpay_signature

            ){

                return{

                    statusCode:400,

                    body:

                        JSON.stringify({

                            success:false

                        })

                };

            }

            return{

                statusCode:200,

                body:

                    JSON.stringify({

                        success:true

                    })

            };

        }catch(err){

            return{

                statusCode:500,

                body:

                    JSON.stringify({

                        success:false,

                        error:

                        err.message

                    })

            };

        }

    };