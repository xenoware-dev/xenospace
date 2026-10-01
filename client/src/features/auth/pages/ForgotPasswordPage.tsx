import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  AuthFooterNote,
  AuthHeading,
  AuthSubmit,
  authField,
  authLink,
} from '@/features/auth/components/auth-ui'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas'
import { authApi } from '@/services/auth.service'

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: ForgotPasswordValues) => {
    await authApi.forgotPassword(values.email)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div>
        <AuthHeading
          title="Check Your Inbox"
          description="If an account exists for that email, a password reset link is on its way."
        />
        <Button
          asChild
          className="h-11 w-full rounded-xl bg-white font-semibold text-neutral-950 hover:bg-white/90"
        >
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <AuthHeading
        title="Forgot Password"
        description="Enter your email and we'll send you a reset link."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="eg. johnfrans@gmail.com"
                    autoComplete="email"
                    className={authField}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <AuthSubmit pending={form.formState.isSubmitting}>Send Reset Link</AuthSubmit>
        </form>
      </Form>

      <AuthFooterNote>
        <Link to="/login" className={authLink}>
          Back to sign in
        </Link>
      </AuthFooterNote>
    </div>
  )
}
