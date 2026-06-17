import { NextResponse } from 'next/server';
import { getBillingEntitlement } from '@/lib/billing';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getChatModelListItems } from '@/lib/models';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entitlement = await getBillingEntitlement(supabase, user.id);

  return NextResponse.json({
    models: getChatModelListItems(entitlement),
    entitlement: {
      planKey: entitlement.planKey,
      canUseCloudModels: entitlement.canUseCloudModels,
      monthlyLimit: entitlement.monthlyLimit,
    },
  });
}
