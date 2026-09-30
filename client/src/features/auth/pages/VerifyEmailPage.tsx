import { AxiosError } from 'axios'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    <Card>
      <CardHeader className="items-center text-center">
        {state === 'loading' && <Loader2 className="text-muted-foreground mb-2 size-8 animate-spin" />}
        {state === 'success' && <CheckCircle2 className="text-success mb-2 size-8" />}
        {state === 'error' && <XCircle className="text-destructive mb-2 size-8" />}
        <CardTitle className="text-xl">
          {state === 'loading' && 'Verifying your email...'}
          {state === 'success' && 'Email verified'}
          {state === 'error' && 'Verification failed'}
        </CardTitle>
        <CardDescription>
          {state === 'success' && 'Your email address has been verified. You can now sign in.'}
          {state === 'error' && message}
        </CardDescription>
      </CardHeader>
      {state !== 'loading' && (
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
