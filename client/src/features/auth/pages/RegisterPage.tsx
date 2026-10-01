import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

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
  AuthDivider,
  AuthFooterNote,
  AuthHeading,
  AuthSubmit,
  authField,
  authLink,
  PasswordField,
  SocialAuthButtons,
} from '@/features/auth/components/auth-ui'
import { registerSchema, type RegisterValues } from '@/features/auth/schemas'
import { authApi } from '@/services/auth.service'

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', username: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: RegisterValues) => {
    try {
      await authApi.register(values)
      setSubmitted(true)
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ?? 'Unable to create account')
          : 'Unable to create account'
      toast.error(message)
    }
  }

  if (submitted) {
    return (
      <div>
        <AuthHeading
          title="Check Your Inbox"
          description="We sent a verification link to your email address. Verify your account, then sign in."
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
        title="Sign Up Account"
        description="Enter your personal data to create your account."
      />

      <SocialAuthButtons />
      <AuthDivider />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Full Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="eg. Ada Lovelace"
                      autoComplete="name"
                      className={authField}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="eg. ada"
                      autoComplete="username"
                      className={authField}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Password</FormLabel>
                <PasswordField
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  {...field}
                />
                {form.formState.errors.password ? (
                  <FormMessage />
                ) : (
                  <p className="text-xs text-white/40">Must be at least 8 characters.</p>
                )}
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Confirm Password</FormLabel>
                <PasswordField
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  {...field}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <AuthSubmit pending={form.formState.isSubmitting}>Sign Up</AuthSubmit>
        </form>
      </Form>

      <AuthFooterNote>
        Already have an account?{' '}
        <Link to="/login" className={authLink}>
          Log in
        </Link>
      </AuthFooterNote>
    </div>
  )
}
