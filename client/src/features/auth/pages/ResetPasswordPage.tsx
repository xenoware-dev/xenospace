import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

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
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas'
import { authApi } from '@/services/auth.service'

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
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invalid link</CardTitle>
          <CardDescription>This password reset link is missing or malformed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Password updated</CardTitle>
          <CardDescription>You can now sign in with your new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Continue to sign in
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>Choose a new password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="mt-2 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Reset password
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
