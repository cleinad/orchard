const DEFAULT_AUTH_REDIRECT = '/home';

export function getSafeRedirectPath(redirect: string | null) {
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return DEFAULT_AUTH_REDIRECT;
  }

  if (redirect === '/' || redirect.startsWith('/login') || redirect.startsWith('/signup')) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return redirect;
}
