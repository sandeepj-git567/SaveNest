import { createClient } from '@/lib/supabase/server'
import LoginButton from '@/components/LoginButton'
import BookmarkList from '@/components/BookmarkList'
import Image from 'next/image'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gray-50">
      {!user ? (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center max-w-lg w-full">
            <div className="mb-4">
              <Image 
                src="/logo.png" 
                alt="SaveNest Logo" 
                width={320} 
                height={100}
                priority
                className="mx-auto w-80"
              />
            </div>
            <p className="text-gray-600 mb-10 text-xl">Your links, safely nested.</p>
            <LoginButton />
          </div>
        </div>
      ) : (
        <BookmarkList userId={user.id} />
      )}
    </div>
  )
}
