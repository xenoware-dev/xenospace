import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import {
  AuthHeading,
  AuthSubmit,
  authLabel,
  authLink,
  PasswordField,
} from '@/features/auth/components/auth-ui'
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas'
import { authApi } from '@/services/auth.service'

const solidAction = 'h-12 w-full rounded-xl bg-white font-semibold text-neutral-950 hover:bg-white/90'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: ResetPasswordValues) => {
    if (!token) {
      toast.error('Reset link is missing a token')
      return
    }
    try {
      await authApi.resetPassword(token, values.password)
      setDone(true)
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ?? 'Unable to reset password')
          : 'Unable to reset password'
      toast.error(message)
    }
  }

  if (!token) {
    return (
      <div>
        <AuthHeading
          title="Invalid Link"
          description="This password reset link is missing or malformed."
        />
        <Button asChild className={solidAction}>
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    )
  }

  if (done) {
    return (
      <div>
        <AuthHeading
          title="Password Updated"
          description="You can now sign in with your new password."
        />
        <Button className={solidAction} onClick={() => navigate('/login', { replace: true })}>
          Continue to sign in
        </Button>
      </div>
    )
  }

  return (
    <div>
      <AuthHeading
        title="Reset Password"
        description="Choose a new password for your account."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="gap-2">
                <FormLabel className={authLabel}>New Password</FormLabel>
                <PasswordField
                  placeholder="Enter your new password"
                  autoComplete="new-password"
                  {...field}
                />
                {form.formState.errors.password ? (
                  <FormMessage />
                ) : (
                  <p className="text-xs text-white/40">At least 8 characters, with upper and lowercase letters and a number.</p>
                )}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem className="gap-2">
                <FormLabel className={authLabel}>Confirm New Password</FormLabel>
                <PasswordField
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  {...field}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <AuthSubmit pending={form.formState.isSubmitting}>Reset Password</AuthSubmit>
        </form>
      </Form>

      <p className="mt-7 text-center text-sm text-white/50">
        <Link to="/login" className={authLink}>
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
