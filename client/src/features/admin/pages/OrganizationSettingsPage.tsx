import { zodResolver } from '@hookform/resolvers/zod'
import { AxiosError } from 'axios'
import { Loader2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { departmentApi } from '@/services/department.service'
import type { Department } from '@/types/team'
import { PageHeader } from '@/components/common/PageHeader'

const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  description: z.string().trim().max(300).optional(),
})
type DepartmentValues = z.infer<typeof departmentSchema>

export default function OrganizationSettingsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const form = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: '', description: '' },
  })

  const load = () => {
    setIsLoading(true)
    departmentApi
      .list()
      .then(({ data }) => setDepartments(data.departments))
      .catch(() => toast.error('Unable to load departments'))
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [])

  const onSubmit = async (values: DepartmentValues) => {
    try {
      await departmentApi.create(values)
      toast.success('Department created')
      form.reset()
      load()
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ?? 'Unable to create department')
          : 'Unable to create department'
      toast.error(message)
    }
  }

  const handleDelete = async (department: Department) => {
    if (!window.confirm(`Delete "${department.name}"? Members will be unassigned.`)) return
    try {
      await departmentApi.remove(department._id)
      toast.success('Department deleted')
      setDepartments((prev) => prev.filter((d) => d._id !== department._id))
    } catch {
      toast.error('Unable to delete department')
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Organization Settings"
        description="Manage departments across Xenoware"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a department</CardTitle>
          <CardDescription>Departments help organize the team directory</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Engineering" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Add
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Departments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)
          ) : departments.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">No departments yet.</p>
          ) : (
            departments.map((department) => (
              <div
                key={department._id}
                className="flex items-center justify-between border-b py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium">{department.name}</p>
                  {department.description && (
                    <p className="text-muted-foreground text-xs">{department.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(department)}
                  aria-label={`Delete ${department.name}`}
                >
                  <Trash2 className="text-destructive size-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
