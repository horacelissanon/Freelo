// The real signup UI lives in the unified login/signup card at
// src/app/login/page.tsx (?mode=signup opens it on the "Créer un compte"
// tab). This route stays in place — rather than being deleted outright —
// only so any bookmarked/external link to /signup still lands somewhere
// real instead of a 404.
import { redirect } from 'next/navigation';

export default function SignupPage() {
  redirect('/login?mode=signup');
}
