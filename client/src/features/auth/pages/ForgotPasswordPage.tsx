import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
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
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Check your inbox</CardTitle>
          <CardDescription>
            If an account exists for that email, a password reset link is on its way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Forgot your password?</CardTitle>
        <CardDescription>Enter your email and we&apos;ll send you a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@xenoware.dev" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="mt-2 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Send reset link
            </Button>
          </form>
        </Form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          <Link to="/login" className="text-foreground font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
