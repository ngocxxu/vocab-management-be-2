// Labels the User sees for a sign-in method (GLOSSARY.md **Sign-in method**). The subject's own id never leaves the server.
const SIGN_IN_METHODS = new Map<string, string>([
    ['google-oauth2', 'google'],
    ['auth0', 'password'],
]);

export function signInMethodFromSubject(subject: string): string {
    const [connection] = subject.split('|', 1);
    return SIGN_IN_METHODS.get(connection) ?? 'other';
}
