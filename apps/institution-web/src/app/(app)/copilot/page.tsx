import { redirect } from 'next/navigation';

/** The classic Copilot page is superseded by Petros chat. */
export default function CopilotRedirect() {
  redirect('/petros');
}
