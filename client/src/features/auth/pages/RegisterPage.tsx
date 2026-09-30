import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
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
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Check your inbox</CardTitle>
          <CardDescription>
            We sent a verification link to your email address. Verify your account, then sign in.
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
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Join your Xenoware team workspace</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input placeholder="Ada Lovelace" autoComplete="name" {...field} />
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
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="ada" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
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
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="mt-2 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Create account
            </Button>
          </form>
        </Form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-foreground font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
