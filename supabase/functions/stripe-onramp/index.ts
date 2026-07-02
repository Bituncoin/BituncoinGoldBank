import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const body = await req.json();
    const { amount, coin, method } = body as {
      amount: number;
      coin: string;
      method: string;
    };

    if (!amount || amount < 1) {
      throw new Error("Minimum deposit amount is $1 USD.");
    }

    // ── Get authenticated user (optional — supports guest checkout) ──────────
    let userEmail: string | undefined;
    let customerId: string | undefined;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (data?.user?.email) {
        userEmail = data.user.email;
      }
    }

    // ── Init Stripe ──────────────────────────────────────────────────────────
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
      apiVersion: "2025-08-27.basil",
    });

    // ── Find or skip existing customer ────────────────────────────────────────
    if (userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // ── Create a one-time Checkout session ───────────────────────────────────
    const amountCents = Math.round(amount * 100);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `BTNG Gold Deposit — ${coin}`,
              description: `Deposit $${amount} USD via ${method ?? "Stripe"} to your BTNG Gold account`,
              images: [],
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "btng://deposit/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "btng://deposit/cancel",
      metadata: {
        coin: coin ?? "USDT",
        method: method ?? "Stripe",
        amount_usd: String(amount),
      },
      payment_intent_data: {
        metadata: {
          btng_coin: coin ?? "USDT",
          btng_method: method ?? "Stripe",
        },
      },
    });

    console.log(`[stripe-onramp] session created: ${session.id} for $${amount} ${coin}`);

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[stripe-onramp] error:", error?.message);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
