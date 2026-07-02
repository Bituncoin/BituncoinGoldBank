// BTNG Gold — Security Gateway: OTP Verifier v3
// Handles: signup | login | password_reset
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      email,
      code,
      password,
      new_password,
      full_name = '',
      purpose = 'signup',
      context = {},
    } = body;

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and verification code are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const normalizedEmail = email.toLowerCase().trim();

    // ── Look up OTP ──────────────────────────────────────────────────────────
    const { data: otpRecord, error: fetchError } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', normalizedEmail)
      .eq('code', code.trim())
      .eq('purpose', purpose)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !otpRecord) {
      console.log(`[BTNG Gateway] Invalid/expired OTP — email=${normalizedEmail} purpose=${purpose}`);
      return new Response(JSON.stringify({
        error: 'Invalid or expired code. Please request a new verification code.',
        error_code: 'INVALID_OTP',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark OTP as used
    await supabase.from('email_otps').update({ used: true }).eq('id', otpRecord.id);

    // ────────────────────────────────────────────────────────────────────────
    // PURPOSE: SIGNUP
    // ────────────────────────────────────────────────────────────────────────
    if (purpose === 'signup') {
      if (!password) {
        return new Response(JSON.stringify({ error: 'Password is required for account creation' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find(u => u.email === normalizedEmail);

      let userId: string;

      if (existingUser) {
        await supabase.auth.admin.updateUserById(existingUser.id, {
          email_confirm: true,
          password,
        });
        userId = existingUser.id;
      } else {
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: full_name ? { username: full_name.split(' ')[0], full_name } : {},
        });
        if (createError || !newUser.user) {
          console.error('[BTNG Gateway] Create user error:', createError);
          return new Response(JSON.stringify({ error: createError?.message || 'Failed to create account' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        userId = newUser.user.id;
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError || !signInData.session) {
        console.error('[BTNG Gateway] Sign-in after signup error:', signInError);
        return new Response(JSON.stringify({ error: 'Account created — please sign in.' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[BTNG Gateway] Signup complete — user=${userId}`);
      return new Response(JSON.stringify({
        status: 'success',
        purpose: 'signup',
        user_id: userId,
        session: signInData.session,
        user: signInData.user,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // PURPOSE: LOGIN
    // ────────────────────────────────────────────────────────────────────────
    if (purpose === 'login') {
      if (!password) {
        return new Response(JSON.stringify({ error: 'Password is required to complete login' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError || !signInData.session) {
        console.error('[BTNG Gateway] Login verify sign-in error:', signInError);
        return new Response(JSON.stringify({ error: 'Authentication failed. Please try again.' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[BTNG Gateway] Login verified — user=${signInData.user.id}`);
      return new Response(JSON.stringify({
        status: 'success',
        purpose: 'login',
        trust_level: 'high',
        user_id: signInData.user.id,
        session: signInData.session,
        user: signInData.user,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // PURPOSE: PASSWORD_RESET — step 2: verify code → return reset grant
    // ────────────────────────────────────────────────────────────────────────
    if (purpose === 'password_reset') {
      if (!new_password) {
        // Just verifying the code — return a short-lived reset grant
        return new Response(JSON.stringify({
          status: 'verified',
          purpose: 'password_reset',
          reset_grant: `${normalizedEmail}::${otpRecord.id}`,
          expires_in_seconds: 900,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // new_password provided — complete reset immediately
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const user = usersData?.users?.find(u => u.email === normalizedEmail);

      if (!user) {
        return new Response(JSON.stringify({ error: 'User account not found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        password: new_password,
      });

      if (updateError) {
        console.error('[BTNG Gateway] Password update error:', updateError);
        return new Response(JSON.stringify({ error: updateError.message || 'Failed to update password' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Sign user in with new password
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: new_password,
      });

      console.log(`[BTNG Gateway] Password reset complete — user=${user.id}`);
      return new Response(JSON.stringify({
        status: 'success',
        purpose: 'password_reset',
        session: signInData?.session ?? null,
        user: signInData?.user ?? null,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown purpose' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[BTNG Gateway] verify-otp-email error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
