import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyDto, CreatedApiKeyDto } from '@identityhub/shared';
import { api } from '@/lib/api';

const KEYS_KEY = ['apiKeys'] as const;

export function useApiKeys() {
  return useQuery({
    queryKey: KEYS_KEY,
    queryFn: () => api.get<ApiKeyDto[]>('/api/api-keys'),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<CreatedApiKeyDto>('/api/api-keys', { name }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEYS_KEY }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/api-keys/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEYS_KEY }),
  });
}
