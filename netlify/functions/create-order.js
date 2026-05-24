const Razorpay=require("razorpay");

exports.handler=async(event)=>{

    const body=
        JSON.parse(
            event.body
        );

    const amount=
        body.amount;

    const razorpay=
        new Razorpay({

            key_id:
            process.env
                .RAZORPAY_KEY_ID,

            key_secret:
            process.env
                .RAZORPAY_KEY_SECRET

        });

    try{

        const order=
            await razorpay.orders.create({

                amount:
                    amount*100,

                currency:
                    "INR"

            });

        return{

            statusCode:200,

            body:JSON.stringify(
                order
            )

        };

    }catch(err){

        return{

            statusCode:500,

            body:JSON.stringify({

                error:err.message

            })

        };

    }

};