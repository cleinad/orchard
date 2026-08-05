import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publicSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const errors = [];

if (!supabaseUrl) {
  errors.push('NEXT_PUBLIC_SUPABASE_URL is required');
} else {
  try {
    const url = new URL(supabaseUrl);
    const isLocal =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !isLocal) {
      errors.push('NEXT_PUBLIC_SUPABASE_URL must use HTTPS outside localhost');
    }
  } catch {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must be a valid URL');
  }
}

if (!publicSupabaseKey) {
  errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
}

if (publicSupabaseKey?.startsWith('sb_secret_')) {
  errors.push(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY must not contain a Supabase secret key'
  );
}

if (
  publicSupabaseKey &&
  serviceRoleKey &&
  publicSupabaseKey === serviceRoleKey
) {
  errors.push(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY must not equal SUPABASE_SERVICE_ROLE_KEY'
  );
}

if (publicSupabaseKey) {
  try {
    const [, encodedPayload] = publicSupabaseKey.split('.');
    if (encodedPayload) {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8')
      );
      if (payload.role && payload.role !== 'anon') {
        errors.push(
          `NEXT_PUBLIC_SUPABASE_ANON_KEY contains the non-public role ${JSON.stringify(payload.role)}`
        );
      }
    }
  } catch {
    // Current Supabase publishable keys are opaque rather than JWTs.
  }
}

if (errors.length > 0) {
  console.error(
    `Build environment validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`
  );
  process.exit(1);
}

console.log('Build environment validation passed.');
