const Razorpay=require("razorpay");

exports.handler=async(event)=>{

    try{

        const body=
            JSON.parse(
                event.body
            );

        const amount=
            Number(
                body.amount
            );

        if(
            !amount||
            amount<1
        ){

            return{

                statusCode:400,

                body:JSON.stringify({

                    error:
                        "Invalid amount"

                })

            };

        }

        const razorpay=

            new Razorpay({

                key_id:

                process.env
                    .RAZORPAY_KEY_ID,

                key_secret:

                process.env
                    .RAZORPAY_KEY_SECRET

            });

        const order=

            await razorpay
                .orders
                .create({

                    amount:

                        amount*100,

                    currency:

                        "INR",

                    receipt:

                        "ritual_"+Date.now()

                });

        return{

            statusCode:200,

            body:

                JSON.stringify({

                    order_id:

                    order.id,

                    amount:

                    order.amount,

                    currency:

                    order.currency

                })

        };

    }catch(err){

        return{

            statusCode:500,

            body:

                JSON.stringify({

                    error:

                    err.message

                })

        };

    }

};