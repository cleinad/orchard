'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { sanitizeGlobalInstructions } from '@/lib/global-instructions';
import type {
  SaveGlobalInstructionsResult,
  SignOutResult,
} from '@/app/settings/types';

export async function saveGlobalInstructions(
  value: string
): Promise<SaveGlobalInstructionsResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login?redirect=%2Fsettings');
  }

  const normalized = sanitizeGlobalInstructions(value);
  const { data, error } = await supabase
    .from('profiles')
    .update({ global_instructions: normalized })
    .eq('id', user.id)
    .select('global_instructions')
    .single();

  if (error || !data) {
    return { status: 'error' };
  }

  const persistedValue = sanitizeGlobalInstructions(
    data.global_instructions ?? normalized
  );
  revalidatePath('/settings');

  return { status: 'saved', value: persistedValue };
}

export async function signOut(): Promise<SignOutResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { status: 'error' };
  }

  redirect('/login');
}
