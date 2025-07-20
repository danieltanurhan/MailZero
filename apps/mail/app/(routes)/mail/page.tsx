export function clientLoader() {
  return Response.redirect(`${import.meta.env.VITE_PUBLIC_APP_URL}/mail/inbox`);
}

export default function MailPage() {
  // This component should never be rendered since clientLoader redirects
  return null;
}
