import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api.js';
import { useToast } from '@/components/ui/Toast.jsx';

/**
 * Mutation with the app's standard feedback.
 *
 * Wraps useMutation so every write surfaces a toast on failure — a silent
 * failure is the worst outcome — and invalidates the caches it affects without
 * each call site remembering to.
 */
export function useMutate<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    /**
     * Query key prefixes to invalidate on success. Readonly because the key
     * factory returns `as const` tuples.
     */
    invalidates?: ReadonlyArray<readonly unknown[]>;
    successMessage?: string | ((data: TData) => string);
    errorMessage?: string;
    onSuccess?: (data: TData, variables: TVariables) => void;
  } & Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn' | 'onSuccess'> = {},
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { invalidates, successMessage, errorMessage: errorTitle, onSuccess, ...rest } = options;

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    onSuccess: (data, variables) => {
      for (const key of invalidates ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      if (successMessage) {
        toast.success(typeof successMessage === 'function' ? successMessage(data) : successMessage);
      }
      onSuccess?.(data, variables);
    },
    onError: (error) => {
      toast.error(errorTitle ?? 'That did not work', errorMessage(error));
    },
    ...rest,
  });
}
