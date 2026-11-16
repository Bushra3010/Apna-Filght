import { getContext } from '@/lib/context'
import { can, type Permissions } from '@/lib/permissions'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/tile'
import { Button } from '@/components/ui/button'
import { InviteForm } from './invite-form'
import { MemberRow } from './member-row'
import { RoleForm } from './role-form'
import { revokeInvite } from './actions'

export const metadata = { title: 'Team' }

export default async function TeamPage() {
  const { supabase, org, member } = await getContext()
  const [{ data: members }, { data: roles }, { data: invites }] = await Promise.all([
    supabase.from('org_members').select('id, display_name, designation, mobile, role_id, reports_to, is_active').eq('org_id', org.id).order('display_name'),
    supabase.from('roles').select('id, name, is_owner, permissions').eq('org_id', org.id).order('is_owner', { ascending: false }).order('name'),
    supabase.from('org_invites').select('id, email, role_id, expires_at, accepted_at').eq('org_id', org.id).is('accepted_at', null).order('created_at', { ascending: false }),
  ])
  const me = members?.find((m) => m.id === member.id)
  const myRole = roles?.find((r) => r.id === me?.role_id) as { is_owner: boolean; permissions: Permissions } | undefined
  const canEdit = can(myRole, 'users', 'edit')
  const roleName = new Map(roles?.map((r) => [r.id, r.name]))
  const memberOpts = (members ?? []).map((m) => ({ id: m.id, name: m.display_name }))

  return (
    <>
      <PageHeader title="Team" description="People who can sign in to this company, what they can do, and who they report to" />
      <div className="grid gap-6">
        <Panel title="Members" count={members?.length ?? 0}>
          <div className="grid gap-2">
            {members?.map((m) => (
              <MemberRow key={m.id} m={m} roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))} members={memberOpts} isMe={m.id === member.id} canEdit={canEdit} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">“Reports to” builds the hierarchy used for “my team” views on the CRM dashboard and lead lists.</p>
        </Panel>

        {canEdit && (
          <Panel title="Invite someone">
            <InviteForm roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))} />
            {invites && invites.length > 0 && (
              <ul className="mt-4 grid gap-2 text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/60 px-4 py-2.5">
                    <span>{i.email} <span className="text-muted-foreground">· {roleName.get(i.role_id)} · {new Date(i.expires_at) < new Date() ? 'expired' : `expires ${new Date(i.expires_at).toLocaleDateString('en-IN')}`}</span></span>
                    <form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><Button type="submit" variant="ghost" size="sm">Cancel invite</Button></form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <section className="grid gap-3">
          <h2 className="text-2xl font-bold tracking-tight">Roles</h2>
          <p className="text-sm text-muted-foreground">Each action is checked by the database, so a role can’t do more than it’s allowed even outside the app.</p>
          {roles?.map((r) => <RoleForm key={r.id} role={{ ...r, permissions: r.permissions as Permissions }} canEdit={canEdit} />)}
          {canEdit && <RoleForm role={{ name: '', permissions: {} }} canEdit />}
        </section>
      </div>
    </>
  )
}
