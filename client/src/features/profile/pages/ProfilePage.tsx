import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import { authApi } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
type PasswordValues = z.infer<typeof passwordSchema>

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  if (!user) return null

  const onSubmit = async (values: PasswordValues) => {
    try {
      await authApi.changePassword(values.currentPassword, values.newPassword)
      toast.success('Password changed successfully')
      form.reset()
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ?? 'Unable to change password')
          : 'Unable to change password'
      toast.error(message)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar className="size-20">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
            <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col gap-1">
            <h1 className="text-xl font-semibold">{user.name}</h1>
            <p className="text-muted-foreground text-sm">@{user.username}</p>
            <p className="text-muted-foreground text-sm">{user.email}</p>
          </div>
          <div className="flex flex-col items-center gap-2 sm:items-end">
            <Badge>{user.role.replace('_', ' ')}</Badge>
            {!user.isEmailVerified && <Badge variant="warning">Email not verified</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Update the password used to sign in to Xenospace</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
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
              <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Update password
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
