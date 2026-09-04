import type { Metadata } from 'next'
import MentorPage from './MentorPage'
import { DEMO_USER_ID } from '@/lib/localScope'
import { getServerUserId } from '@/lib/server/auth'

export const metadata: Metadata = {
  title: 'Mentor · Pulse',
}

// The Mentor is a full page, not a popup: y — the overseer. Your goals, the
// weight of every tile on them, and what the mentor noticed in your data.
export default async function Page() {
  // Same rule as /app: the signed-in uid, else the anonymous demo namespace.
  const userId = await getServerUserId()
  return <MentorPage userId={userId ?? DEMO_USER_ID} />
}
