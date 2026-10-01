import { AxiosError } from 'axios'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { AuthHeading } from '@/features/auth/components/auth-ui'
import { authApi } from '@/services/auth.service'

type State = 'loading' | 'success' | 'error'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setMessage('This verification link is missing a token.')
      return
    }

    authApi
      .verifyEmail(token)
      .then(() => setState('success'))
      .catch((error) => {
        const msg =
          error instanceof AxiosError
            ? (error.response?.data?.message ?? 'Verification failed')
            : 'Verification failed'
        setMessage(msg)
        setState('error')
      })
  }, [token])

  return (
    <div className="text-center">
      <div className="mb-5 flex justify-center">
        {state === 'loading' && <Loader2 className="size-8 animate-spin text-white/50" />}
        {state === 'success' && <CheckCircle2 className="text-success size-8" />}
        {state === 'error' && <XCircle className="text-destructive size-8" />}
      </div>

      <AuthHeading
        title={
          state === 'loading'
            ? 'Verifying Your Email'
            : state === 'success'
              ? 'Email Verified'
              : 'Verification Failed'
        }
        description={
          state === 'success'
            ? 'Your email address has been verified. You can now sign in.'
            : state === 'error'
              ? message
              : undefined
        }
      />

      {state !== 'loading' && (
        <Button
          asChild
          className="h-12 w-full rounded-xl bg-white font-semibold text-neutral-950 hover:bg-white/90"
        >
          <Link to="/login">Back to sign in</Link>
        </Button>
      )}
    </div>
  )
}
