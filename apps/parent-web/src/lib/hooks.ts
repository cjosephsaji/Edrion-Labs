'use client';
import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { ParentMeResponse, ParentDashboardResponse } from '@edrion/schemas';
import { api } from './api';

/** Generic GET hook keyed by path. */
export function useGet<T>(path: string, opts?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({ queryKey: [path], queryFn: () => api.get<T>(path), ...opts });
}

export const useMe = () => useGet<ParentMeResponse>('/me');
export const useDashboard = (studentId: string | undefined) =>
  useGet<ParentDashboardResponse>(`/dashboard?studentId=${studentId}`, { enabled: !!studentId });

/** Generic POST mutation that invalidates the given query paths on success. */
export function usePost<TBody, TRes = unknown>(path: string | ((body: TBody) => string), invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation<TRes, Error, TBody>({
    mutationFn: (body: TBody) => api.post<TRes>(typeof path === 'function' ? path(body) : path, body),
    onSuccess: () => invalidate.forEach((p) => qc.invalidateQueries({ queryKey: [p] })),
  });
}
