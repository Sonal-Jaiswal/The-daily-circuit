import { getPrisma } from "@tdc/db";
import { formatIstDateTime } from "@tdc/core/time/ist";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { PageHeader } from "@/components/admin/ui";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Table, Td, Th } from "@/components/ui/primitives";
import { createUser, updateUser } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";

export default async function UsersPage() {
  const me = await requireUser("users:manage");
  const users = await getPrisma().user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true } });
  return (
    <>
      <PageHeader title="Users" description="Admins manage settings and users. Editors review, edit and publish. Viewers can read the dashboard." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Last sign-in</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <span className="font-semibold">{u.name}</span> {!u.isActive && <Badge tone="bad">deactivated</Badge>}
                  <div className="text-xs text-ink-3">{u.email}</div>
                </Td>
                <Td>
                  {u.id === me.id ? (
                    u.role.toLowerCase()
                  ) : (
                    <ActionForm action={updateUser} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="intent" value="role" />
                      <Select name="role" defaultValue={u.role} className="h-8" aria-label={`Role for ${u.email}`}>
                        <option value="ADMIN">Admin</option>
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                      </Select>
                      <SubmitButton size="sm" variant="ghost">
                        Set
                      </SubmitButton>
                    </ActionForm>
                  )}
                </Td>
                <Td className="tabular text-xs text-ink-3">{u.lastLoginAt ? formatIstDateTime(u.lastLoginAt) : "never"}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    {u.id !== me.id && (
                      <ActionForm action={updateUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="intent" value={u.isActive ? "deactivate" : "activate"} />
                        <SubmitButton size="sm" variant="outline">
                          {u.isActive ? "Deactivate" : "Reactivate"}
                        </SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm action={updateUser} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="intent" value="password" />
                      <Input name="password" type="password" placeholder="New password" minLength={12} className="h-8" autoComplete="new-password" aria-label={`New password for ${u.email}`} />
                      <SubmitButton size="sm" variant="ghost">
                        Reset
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Add a user</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createUser} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Name</Label>
                <Input id="u-name" name="name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-email">Email</Label>
                <Input id="u-email" name="email" type="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-role">Role</Label>
                <Select id="u-role" name="role" defaultValue="EDITOR" className="w-full">
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-pass">Temporary password</Label>
                <Input id="u-pass" name="password" type="password" minLength={12} required autoComplete="new-password" />
              </div>
              <SubmitButton>Create user</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
