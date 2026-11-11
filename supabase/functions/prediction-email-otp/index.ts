// Cubet email sign-in for audience predictions.
//
//   POST { action: "send", email }          -> emails a 6-digit code (via EmailJS) to an @cubettech.com address
//   POST { action: "verify", email, code }  -> checks the code and returns { token_hash } for
//                                              supabase.auth.verifyOtp({ token_hash, type: "magiclink" })
//
// The code is made and checked here (never in the browser; the table is service-role only), lasts 10 minutes
// and allows 5 tries. Asking again within those 10 minutes re-sends the same code; after that a new one is made.
// Secrets: EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2.79.0';

const DOMAIN = '@cubettech.com';
const CODE_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/** Compare without leaking how many leading digits matched. */
const sameCode = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const newCode = () => {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
};

/** "bibin.francis@cubettech.com" -> "Bibin Francis" */
const nameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ') || 'Player';

const emailLoginOn = async () => {
  const { data } = await admin.from('prediction_settings').select('email_login').eq('id', 1).maybeSingle();
  return data?.email_login === true;
};

const sendEmail = async (email: string, code: string, minutesLeft: number) => {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: Deno.env.get('EMAILJS_SERVICE_ID'),
      template_id: Deno.env.get('EMAILJS_TEMPLATE_ID'),
      user_id: Deno.env.get('EMAILJS_PUBLIC_KEY'),
      accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY'),
      template_params: {
        email,
        to_email: email,
        to_name: nameFromEmail(email),
        passcode: code,
        otp: code,
        time: minutesLeft === 1 ? '1 minute' : `${minutesLeft} minutes`
      }
    })
  });
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${await res.text()}`);
};

const send = async (email: string) => {
  const { data: existing } = await admin.from('email_otps').select('*').eq('email', email).maybeSingle();
  if (existing && Date.now() - new Date(existing.sent_at).getTime() < RESEND_SECONDS * 1000) {
    return reply({ error: 'Please wait a minute before asking for a new code.' }, 429);
  }

  // Still valid (and not used up by wrong tries): send the same code again, same expiry
  const stillValid = existing && new Date(existing.expires_at).getTime() > Date.now() && existing.attempts < MAX_ATTEMPTS;
  const code: string = stillValid ? existing.code : newCode();
  const expiresAt = stillValid ? new Date(existing.expires_at) : new Date(Date.now() + CODE_MINUTES * 60_000);

  const { error } = await admin.from('email_otps').upsert({
    email,
    code,
    expires_at: expiresAt.toISOString(),
    attempts: stillValid ? existing.attempts : 0,
    sent_at: new Date().toISOString()
  });
  if (error) throw error;
  try {
    await sendEmail(email, code, Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60_000)));
  } catch (err) {
    if (!stillValid) await admin.from('email_otps').delete().eq('email', email);
    throw err;
  }
  return reply({ ok: true, expires_at: expiresAt.toISOString(), same_code: !!stillValid });
};

const verify = async (email: string, code: string) => {
  const { data: row } = await admin.from('email_otps').select('*').eq('email', email).maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return reply({ error: 'This code has expired. Please ask for a new one.' }, 400);
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return reply({ error: 'Too many wrong tries. Please ask for a new code.' }, 429);
  }
  if (!sameCode(code, row.code)) {
    await admin.from('email_otps').update({ attempts: row.attempts + 1 }).eq('email', email);
    return reply({ error: 'That code is not right. Please check and try again.' }, 400);
  }
  await admin.from('email_otps').delete().eq('email', email);

  // Make sure the user exists (already confirmed: they just proved they own the inbox)
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: nameFromEmail(email) }
  });
  if (createError && !/already|registered|exists/i.test(createError.message)) throw createError;

  // One-time sign-in token the browser swaps for a session
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) throw error ?? new Error('Could not create sign-in link');
  return reply({ token_hash: data.properties.hashed_token });
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@cubettech\.com$/.test(email) || !email.endsWith(DOMAIN)) {
      return reply({ error: 'Please use your Cubet email (name@cubettech.com).' }, 400);
    }
    if (!(await emailLoginOn())) {
      return reply({ error: 'Cubet email sign-in is turned off right now.' }, 403);
    }
    if (body.action === 'send') return await send(email);
    if (body.action === 'verify') {
      const code = String(body.code ?? '').replace(/\D/g, '');
      if (code.length !== 6) return reply({ error: 'Enter the 6-digit code from the email.' }, 400);
      return await verify(email, code);
    }
    return reply({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('prediction-email-otp failed:', err);
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
