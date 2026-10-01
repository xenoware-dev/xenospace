import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

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
import { loginSchema, type LoginValues } from '@/features/auth/schemas'
import { authApi } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setUser = useAuthStore((s) => s.setUser)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: LoginValues) => {
    try {
      const { data } = await authApi.login(values)
      setUser(data.user)
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'
      navigate(from, { replace: true })
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ?? 'Unable to sign in')
          : 'Unable to sign in'
      toast.error(message)
    }
  }

  return (
    <div>
      <AuthHeading
        title="Sign In Account"
        description="Enter your credentials to open your workspace."
      />

      <SocialAuthButtons />
      <AuthDivider />

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
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-white">Password</FormLabel>
                  <Link to="/forgot-password" className="text-xs text-white/50 hover:text-white">
                    Forgot password?
                  </Link>
                </div>
                <PasswordField
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  {...field}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <AuthSubmit pending={form.formState.isSubmitting}>Sign In</AuthSubmit>
        </form>
      </Form>

      <AuthFooterNote>
        Don&apos;t have an account?{' '}
        <Link to="/register" className={authLink}>
          Sign up
        </Link>
      </AuthFooterNote>
    </div>
  )
}
